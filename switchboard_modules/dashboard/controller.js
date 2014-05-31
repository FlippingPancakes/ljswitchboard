/**
 * Goals for the Lua Script Debugger module.
 * This is a Lua script intro-app that performs a minimal number of scripting
 * operations.  It is simply capable of detecting whether or not a Lua script
 * is running and then prints out the debugging log to the window.  
 *
 * @author Chris Johnson (LabJack Corp, 2014)
 *
 * Configuration:
 * No configuration of the device is required
 *
 * Periodic Processes:
 *     1. Read from "LUA_RUN" register to determine if a Lua script is running.
 *     2. Read from "LUA_DEBUG_NUM_BYTES" register to determine how much data is
 *         available in the debugging info buffer.
 *     3. If there is data available in the debugging buffer then get it from
 *         the device. 
**/

// TODO: Integrate http://jsfiddle.net/Vdsu2/8/

// Constant that determines device polling rate.  Use an increased rate to aid
// in user experience.
var MODULE_UPDATE_PERIOD_MS = 500;

// Constant that can be set to disable auto-linking the module to the framework
var DISABLE_AUTOMATIC_FRAMEWORK_LINKAGE = false;

/**
 * Module object that gets automatically instantiated & linked to the appropriate framework.
 * When using the 'singleDevice' framework it is instantiated as sdModule.
 */
function module() {
    this.moduleConstants = {};
    this.REGISTER_OVERLAY_SPEC = {};
    this.startupRegList = {};
    this.interpretRegisters = {};
    this.startupRegListDict = dict();

    this.expanded
    this.moduleContext = {};
    this.activeDevice = undefined;

    this.currentValues = dict();
    this.bufferedValues = dict();
    this.bufferedOutputValues = dict();

    

    /**
     * Function is called once every time the module tab is selected, loads the module.
     * @param  {[type]} framework   The active framework instance.
     * @param  {[type]} onError     Function to be called if an error occurs.
     * @param  {[type]} onSuccess   Function to be called when complete.
    **/
    this.onModuleLoaded = function(framework, onError, onSuccess) {
        console.log('in onModuleLoaded');
        // device_controller.ljm_driver.writeLibrarySync('LJM_SEND_RECEIVE_TIMEOUT_MS',5000);
        // Save Module Constant objects
        self.moduleConstants = framework.moduleConstants;
        self.startupRegList = framework.moduleConstants.startupRegList;
        self.interpretRegisters = framework.moduleConstants.interpretRegisters;
        self.REGISTER_OVERLAY_SPEC = framework.moduleConstants.REGISTER_OVERLAY_SPEC;

        var genericConfigCallback = function(data, onSuccess) {
            console.log('genericConfigCallback');
            onSuccess();
        };
        var genericPeriodicCallback = function(data, onSuccess) {
            
            var name = data.binding.binding;
            var value = Number(data.value.toFixed(self.DAC_CHANNEL_PRECISION));
            self.bufferedValues.set(name,value);
            // console.log('genericPeriodicCallback',data.binding.binding,value);
            onSuccess();
        };

        console.log('moduleConstants', self.moduleConstants);
        var smartBindings = [];
        var addSmartBinding = function(regInfo) {
            var binding = {};
            binding.bindingName = regInfo.name;
            if(regInfo.isPeriodic && regInfo.isConfig){
                // Add to list of config & periodicically read registers
                binding.smartName = 'readRegister';
                binding.periodicCallback = genericPeriodicCallback;
            } else if ((!regInfo.isPeriodic) && regInfo.isConfig) {
                // Add to list of config registers
                binding.smartName = 'setupOnlyRegister';
            }
            binding.configCallback = genericConfigCallback;
            smartBindings.push(binding);
            
        };

        // Add general readRegisters
        self.startupRegList.forEach(addSmartBinding);

        // Save the smartBindings to the framework instance.
        framework.putSmartBindings(smartBindings);
        // Save the customSmartBindings to the framework instance.
        // framework.putSmartBindings(customSmartBindings);

        self.createProcessConfigStatesAndDirections();

        onSuccess();
    };

    this.expandLJMMMNameSync = function (name) {
        return ljmmm_parse.expandLJMMMEntrySync(
            {name: name, address: 0, type: 'FLOAT32'}
        ).map(function (entry) { return entry.name });
    };

    this.createProcessConfigStatesAndDirections = function () {
        var registersByDirectionReg = dict();
        var registersByStateReg = dict();
        var registersToExpand;
        var expandedRegisters;

        registersToExpand = self.interpretRegisters.filter(function (reg) {
            return reg.stateReg;
        });

        expandedRegisters = registersToExpand.map(function (reg) {
            var names = self.expandLJMMMNameSync(reg.name);
            var regList;
            
            // Set up a mapping by the state reg
            regList = registersByStateReg.get(reg.stateReg, []);
            regList = regList.concat(names.map(function (name, index) {
                return {
                    name: name,
                    stateReg: reg.stateReg,
                    directionReg: reg.directionReg,
                    index: index
                };
            }));
            registersByStateReg.set(reg.stateReg, regList);

            // Set up a mapping by the direction reg
            regList = registersByDirectionReg.get(reg.directionReg, []);
            regList = regList.concat(names.map(function (name, index) {
                return {
                    name: name,
                    stateReg: reg.stateReg,
                    directionReg: reg.directionReg,
                    index: index
                };
            }));
            registersByDirectionReg.set(reg.directionReg, regList);
        });

        var handleStates = function (states, address, viewRegInfoDict) {
            console.log(address);
            var registers = registersByStateReg.get(address);
            console.log(registers);
            registers.forEach(function (register) {
                var state = states >> register.index & 0x1;
                var viewRegInfo = viewRegInfoDict.get(register.name, {});
                viewRegInfo.state = state;
                viewRegInfo.type = 'dynamic';
                viewRegInfoDict.set(register.name, viewRegInfo);
            });
        };

        var handleDirections = function (directions, address, viewRegInfoDict) {
            var registers = registersByDirectionReg.get(address);
            registers.forEach(function (register) {
                var direction = directions >> register.index & 0x1;
                var viewRegInfo = viewRegInfoDict.get(register.name, {});
                viewRegInfo.direction = direction;
                viewRegInfoDict.set(register.name, viewRegInfo);
            });
        };

        var handleOther = function (value, address, viewRegInfoDict) {
            var viewRegInfo = viewRegInfoDict.get(address, {});
            viewRegInfo.value = value;
            viewRegInfo.type = 'static';
            viewRegInfoDict.set(address, viewRegInfo);
        };

        var hasText = function (haystack, needle) {
            return haystack.indexOf(needle) != -1;
        };

        console.log('here?');

        self.processConfigStatesAndDirections = function (registers,
            onSuccess) {
            var viewRegInfoDict = dict();
            registers.forEach(function (regValue, regAddress) {
                if (hasText(regAddress, 'STATE')) {
                    handleStates(regValue, regAddress, viewRegInfoDict);
                } else if (hasText(regAddress, 'DIRECTION')) {
                    handleDirections(regValue, regAddress, viewRegInfoDict);
                } else {
                    handleOther(regValue, regAddress, viewRegInfoDict);
                }
            });

            viewRegInfoDict.forEach(function (viewRegInfo, regAddress) {
                //updateControl(viewRegInfo);
                console.log(regAddress,viewRegInfo);
            });

            onSuccess();
        };
    };
    
    /**
     * Function is called once every time a user selects a new device.  
     * @param  {[type]} framework   The active framework instance.
     * @param  {[type]} device      The active framework instance.
     * @param  {[type]} onError     Function to be called if an error occurs.
     * @param  {[type]} onSuccess   Function to be called when complete.
    **/
    this.onDeviceSelected = function(framework, device, onError, onSuccess) {
        console.log('in onDeviceSelected');
        self.activeDevice = device;

        framework.clearConfigBindings();
        framework.setStartupMessage('Reading Device Configuration');
        onSuccess();
    };
    this.onDeviceConfigured = function(framework, device, setupBindings, onError, onSuccess) {
        console.log('in onDeviceConfigured');
        setupBindings.forEach(function(setupBinding){
            var name = setupBinding.address;
            var value;
            if(setupBinding.status === 'error') {
                value = 0;
            } else {
                value = setupBinding.result;
            }
            self.currentValues.set(name,value);
            console.log('Read Register:',name,value);
        });

        self.currentValues.forEach(function(value,name){
            console.log(name,value);
        });


        // self.moduleContext.outputs = self.DACRegisters;
        //framework.setCustomContext(self.moduleContext);
        self.processConfigStatesAndDirections(self.currentValues, onSuccess);
    };

    this.formatVoltageTooltip = function(value) {
        return sprintf.sprintf("%.2f V", value);
    };
    this.writeDisplayedVoltage = function(register, selectedVoltage) {
        console.log(register,selectedVoltage);
        $('#' + register + '_input_slider').slider('setValue', selectedVoltage);
    };
    this.onVoltageSelected = function(event) {
        var firingID = event.target.id;
        var selectedVoltage;
        var isValidValue = false;
        var register = firingID
            .replace('_input_spinner', '')
            .replace('_input_slider', '');

        if (firingID.search('_input_spinner') > 0) {
            var spinText = $('#'+firingID).val();
            if(spinText !== null) {
                isValidValue = (spinText !== null && spinText.match(/[\d]+(\.\d+)?$/g) !== null);
                selectedVoltage = Number(spinText);
            }
        }
        if(isValidValue) {
            console.log('newVal',typeof(selectedVoltage),selectedVoltage,register);
            $('#'+register+'_input_spinner').css('border', 'none');
            self.writeDisplayedVoltage(register,selectedVoltage);
        } else {
            if (firingID.search('_input_spinner') > 0) {
                var spinText = $('#'+firingID).val();
                if (spinText !== null && !spinText.match(/\d+\./g)) {
                    $('#'+register+'_input_spinner').css('border', '1px solid red');
                }
            }
        }
    };
    
    this.createSpinners = function() {
        $( ".spinner" ).unbind();
        $( ".spinner" ).spinner({
            'step': 0.001,
            'numberFormat': "nV",
            'max': 5,
            'min': 0,
            'spin': self.onVoltageSelected,
            'stop': self.onVoltageSelected
        });
    };
    this.onTemplateLoaded = function(framework, onError, onSuccess) {
        console.log('in onTemplateLoaded');
        self.createSpinners();
        onSuccess();
    };
    this.onTemplateDisplayed = function(framework, onError, onSuccess) {
        console.log('in onTemplateDisplayed');
        onSuccess();
    };
    this.onRegisterWrite = function(framework, binding, value, onError, onSuccess) {
        // console.log('in onRegisterWrite',binding);
        onSuccess();
    };
    this.onRegisterWritten = function(framework, registerName, value, onError, onSuccess) {
        onSuccess();
    };
    this.onRefresh = function(framework, registerNames, onError, onSuccess) {
        // console.log('in onRefresh',framework.moduleName);
        onSuccess();
    };
    this.onRefreshed = function(framework, results, onError, onSuccess) {
        self.bufferedValues.forEach(function(value,key){
            self.currentValues.set(key,value);
        });
        onSuccess();
    };
    this.onCloseDevice = function(framework, device, onError, onSuccess) {
        // self.activeDevice.setDebugFlashErr(false);
        onSuccess();
    };
    this.onUnloadModule = function(framework, onError, onSuccess) {
        onSuccess();
    };
    this.onLoadError = function(framework, description, onHandle) {
        console.log('in onLoadError', description);
        onHandle(true);
    };
    this.onWriteError = function(framework, registerName, value, description, onHandle) {
        console.log('in onConfigError', description);
        onHandle(true);
    };
    this.onRefreshError = function(framework, registerNames, description, onHandle) {
        console.log('in onRefreshError', description);
        if(typeof(description.retError) === 'number') {
            console.log('in onRefreshError',device_controller.ljm_driver.errToStrSync(description.retError));
        } else {
            console.log('Type of error',typeof(description.retError),description.retError);
        }
        onHandle(true);
    };

    var self = this;
}
