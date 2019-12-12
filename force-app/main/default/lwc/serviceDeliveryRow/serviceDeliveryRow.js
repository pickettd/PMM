import { LightningElement, track, api } from "lwc";
import { showToast, handleError, debouncify } from "c/util";
import { deleteRecord } from "lightning/uiRecordApi";

import getServicesAndEngagements from "@salesforce/apex/ServiceDeliveryController.getServicesAndEngagements";

import deleteLabel from "@salesforce/label/c.Delete";
import cancel from "@salesforce/label/c.Cancel";
import confirmDelete from "@salesforce/label/c.Confirm_Delete";
import confirmDeleteMessage from "@salesforce/label/c.Confirm_Delete_Row";
import success from "@salesforce/label/c.Success";
import recordDeleted from "@salesforce/label/c.Record_Deleted";
import selectService from "@salesforce/label/c.Select_Service";
import selectEngagement from "@salesforce/label/c.Select_Program_Engagement";

import CONTACT_FIELD from "@salesforce/schema/ServiceDelivery__c.Contact__c";
import SERVICE_FIELD from "@salesforce/schema/ServiceDelivery__c.Service__c";
import PROGRAMENGAGEMENT_FIELD from "@salesforce/schema/ServiceDelivery__c.ProgramEngagement__c";
import SERVICEDELIVERY_OBJECT from "@salesforce/schema/ServiceDelivery__c";

const DELAY = 1000;
const ENGAGEMENTS = "engagements";
const SERVICES = "services";

export default class ServiceDeliveryRow extends LightningElement {
    @api recordId;
    @api index;
    @api
    get fieldSet() {
        return this.localFieldSet;
    }
    set fieldSet(value) {
        this.localFieldSet = value;
    }

    @track localFieldSet;

    _noContactPrograms = false;
    _filteredValues;
    _valuesToSave = [];
    _targetProgram;

    serviceDeliveryObject = SERVICEDELIVERY_OBJECT;
    labels = {
        cancel,
        confirmDelete,
        confirmDeleteMessage,
        deleteLabel,
        recordDeleted,
        selectEngagement,
        selectService,
        success,
    };
    fields = {
        contact: CONTACT_FIELD,
        service: SERVICE_FIELD,
        programEngagement: PROGRAMENGAGEMENT_FIELD,
    };

    autoSaveAfterDebounce = debouncify(this.autoSave.bind(this), DELAY);

    autoSave() {
        let deliverySubmit = this.template.querySelector(".sd-submit");
        if (deliverySubmit) {
            deliverySubmit.click();
        }
    }

    handleGetServicesEngagements(contactId) {
        getServicesAndEngagements({ contactId: contactId })
            .then(result => {
                if (result && (!result[SERVICES] || !result[ENGAGEMENTS].length)) {
                    this._noContactPrograms = true;
                }
                this._filteredValues = result;
                this.handleContactChange();
            })
            .catch(error => {
                handleError(error);
            });
    }

    handleInputChange(event) {
        if (event.target.fieldName === this.fields.contact.fieldApiName) {
            if (event.detail.value && event.detail.value.length) {
                this.handleGetServicesEngagements(event.detail.value[0]);
            } else {
                this.handleResetContact();
            }
        } else {
            this.autoSaveAfterDebounce();
        }
    }

    handleResetContact() {
        this.localFieldSet.forEach(element => {
            element.showFilteredInput = false;
        });
        this._filteredValues = [];
        this._valuesToSave = [];
        this._noContactPrograms = false;
    }

    handleComboChange(event) {
        let fieldName = event.target.name;
        let fieldVal = event.detail.value;

        if (fieldName === this.fields.programEngagement.fieldApiName) {
            this._valuesToSave = []; //If the engagement changes, wipe stored values.
            this._filteredValues[ENGAGEMENTS].forEach(element => {
                if (element.value === fieldVal) {
                    this._targetProgram = element.program;
                }
            });
            this.enableServiceInputWithOptions();
        }

        if (fieldName && fieldVal) {
            this._valuesToSave[fieldName] = fieldVal;
        }

        //If the service value changes, attempt to save the record.
        if (fieldName === this.fields.service.fieldApiName) {
            this.enableFields();
            this.autoSaveAfterDebounce();
        }
    }

    handleContactChange(event) {
        //Make our fieldset mutable the first time it's manipulated.
        this.localFieldSet = this.localFieldSet.map(a => ({ ...a }));

        this.localFieldSet.forEach(element => {
            if (element.apiName === this.fields.service.fieldApiName) {
                element.showFilteredInput = true;
                element.isService = true;
                element.options = this._filteredValues[SERVICES];
                element.placeholder = this.labels.selectService;
            } else if (element.apiName === this.fields.programEngagement.fieldApiName) {
                element.showFilteredInput = true;
                element.isEngagement = true;
                element.options = this._filteredValues[ENGAGEMENTS];
                element.placeholder = this.labels.selectEngagement;
                element.disabled = false;
                if (this._noContactPrograms) {
                    element.disabled = true;
                }
            } else if (element.apiName !== this.fields.contact.fieldApiName) {
                element.disabled == true;
            }
        });
    }

    handleError(event) {
        this.dispatchEvent(new CustomEvent("saveend"));
        handleError(event.detail.message);
    }

    handleSuccess(event) {
        this.recordId = event.detail.id;
        this.dispatchEvent(new CustomEvent("saveend"));
        this.lockContactField();
    }

    handleSubmit(event) {
        let fields = event.detail.fields;

        if (this.recordId) {
            fields.Id = this.recordId;
        }

        for (const [key, value] of Object.entries(this._valuesToSave)) {
            fields[key] = value;
        }

        this.template.querySelector("lightning-record-edit-form").submit(fields);
        this.dispatchEvent(new CustomEvent("savestart"));
    }

    handleDelete() {
        if (this.recordId) {
            deleteRecord(this.recordId)
                .then(() => {
                    this.recordId = "";
                    showToast(this.labels.success, this.labels.recordDeleted, "success");
                    this.dispatchEvent(new CustomEvent("delete", { detail: this.index }));
                })
                .catch(error => {
                    handleError(error);
                });
        } else {
            this.dispatchEvent(new CustomEvent("delete", { detail: this.index }));
        }
    }

    handleShowModal() {
        const modal = this.template.querySelector("c-modal");
        modal.show();
    }

    handleCloseModal() {
        const modal = this.template.querySelector("c-modal");
        modal.hide();
    }

    enableFields() {
        this.localFieldSet.forEach(element => {
            if (element.apiName !== this.fields.contact.fieldApiName) {
                element.disabled = false;
            }
        });
    }

    enableServiceInputWithOptions() {
        let result = [];

        this._filteredValues[SERVICES].forEach(element => {
            if (element.program === this._targetProgram) {
                result.push(element);
            }
        });

        this.localFieldSet.forEach(element => {
            if (element.apiName === this.fields.service.fieldApiName) {
                element.disabled = false;
                element.options = result;
            } else if (
                element.apiName !== this.fields.contact.fieldApiName &&
                element.apiName !== this.fields.programEngagement.fieldApiName
            ) {
                element.disabled = true;
            }
        });
    }

    lockContactField() {
        this.localFieldSet.forEach(element => {
            if (element.apiName === this.fields.contact.fieldApiName) {
                element.disabled = true;
            }
        });
    }

    //Temporary CSS Overrides.
    //TODO : Update when shadow-dom styling options are available.
    renderedCallback() {
        if (this.hasRendered) return;
        this.hasRendered = true;
        const style = document.createElement("style");
        style.innerText = `
        .sd-input .slds-form-element__help {
            position: absolute;
            }
        `;
        this.template.querySelector("div.style-target").appendChild(style);
    }
}
