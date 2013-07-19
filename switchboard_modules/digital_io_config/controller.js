/**
 * Logic for the digital I/O configuration and monitoring module.
 *
 * @author A. Samuel Pottinger (LabJack Corp, 2013)
**/

var handlebars = require('handlebars');

var fs_facade = require('./fs_facade');

var IO_CONFIG_PANE_SELECTOR = '#io-config-pane';

var REGISTERS_DATA_SRC = 'digital_io_config/registers.json';
var INDIVIDUAL_TEMPLATE_SRC = 'digital_io_config/individual_device_config.html';
var MULTIPLE_TEMPLATE_SRC = 'digital_io_config/multiple_device_config.html';
var LOADING_IMAGE_SRC = 'static/img/progress-indeterminate-ring-light.gif';

var DEVICE_SELECT_ID_TEMPLATE_STR = '#{{serial}}-selector';
var DEVICE_SELECT_ID_TEMPLATE = handlebars.compile(
    DEVICE_SELECT_ID_TEMPLATE_STR);


/**
 * Render the controls and display for an individual device.
 *
 * @param {Array} registers An Array of Object with information about the
 *      registers that controls and displays should be created for.
 * @param {Array} devices An Array of Object with information about the devices
 *      that the display / controls should operate on.
 * @param {function} onSuccess The optional callback to call after the controls
 *      have been rendered.
**/
function renderIndividualDeviceControls(registers, devices, onSuccess)
{
    var location = fs_facade.getExternalURI(INDIVIDUAL_TEMPLATE_SRC);
    fs_facade.renderTemplate(
        location,
        {'registers': registers},
        genericErrorHandler,
        function(renderedHTML)
        {
            $(IO_CONFIG_PANE_SELECTOR).html(renderedHTML);
            $('.direction-switch').bootstrapSwitch();

            if(onSuccess !== undefined)
                onSuccess();
        }
    );
}


/**
 * Render the controls and display suitable for manipulating many devices.
 *
 * @param {Array} registers An Array of Object with information about the
 *      registers that controls and displays should be created for.
 * @param {Array} devicd An Array ofObject with informationabout the devices
 *      that the display / controls should operate on.
 * @param {function} onSuccess The optional callback to call after the controls
 *      have been rendered.
**/
function renderManyDeviceControls(registers, devices, onSuccess)
{
    var location = fs_facade.getExternalURI(MULTIPLE_TEMPLATE_SRC);
    fs_facade.renderTemplate(
        location,
        {'registers': registers, 'devices': devices},
        genericErrorHandler,
        function(renderedHTML)
        {
            $(IO_CONFIG_PANE_SELECTOR).html(renderedHTML);
            $('.direction-switch').bootstrapSwitch();

            if(onSuccess !== undefined)
                onSuccess();
        }
    );
}


/**
 * Change the list of devices that are currently being manipulated.
 *
 * Change the list of devices that are currently being manipulated by this
 * digital I/O configuration module.
 *
 * @param {Array} devices An Array of Object with information about the
 *      registers that this module should manage for each device.
**/
function changeActiveDevices(registers)
{
    $(IO_CONFIG_PANE_SELECTOR).fadeOut(function(){
        var devices = [];
        var keeper = device_controller.getDeviceKeeper();

        $('.device-selection-checkbox:checked').each(function(){
            var serial = this.id.replace('-selector', '');
            devices.push(keeper.getDevice(serial));
        });

        var onRender = function() {
            $(IO_CONFIG_PANE_SELECTOR).fadeIn();
        };
        
        if(devices.length == 1)
        {
            renderIndividualDeviceControls(registers, devices, onRender);
        }
        else
        {
            renderManyDeviceControls(registers, devices, onRender);
        }
    });
}


$('#digital-io-configuration').ready(function(){
    var keeper = device_controller.getDeviceKeeper();
    var devices = keeper.getDevices();
    var currentDeviceSelector = DEVICE_SELECT_ID_TEMPLATE(
        {'serial': devices[0].getSerial()}
    );
    
    $(currentDeviceSelector).attr('checked', true);

    $(IO_CONFIG_PANE_SELECTOR).empty().append(
        $('<img>').attr('src', LOADING_IMAGE_SRC)
    );

    var registersSrc = fs_facade.getExternalURI(REGISTERS_DATA_SRC);
    fs_facade.getJSON(registersSrc, genericErrorHandler, function(registerData){
        renderIndividualDeviceControls(registerData, devices);

        $('.device-selection-checkbox').click(function(){
            changeActiveDevices(registerData);
        });
    });
});