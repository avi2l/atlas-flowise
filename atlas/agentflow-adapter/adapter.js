'use strict'

const DISABLED_CODE = 'ATLAS_AGENTFLOW_ADAPTER_DISABLED'
const NON_PRODUCTION_ADAPTER_DEPENDENCIES = Object.freeze([])

class NonProductionAdapterError extends Error {
    constructor(operation) {
        super('The Atlas AgentFlow adapter is a non-production boundary skeleton and is disabled.')
        this.name = 'NonProductionAdapterError'
        this.code = DISABLED_CODE
        this.operation = operation
    }
}

function createNonProductionAdapter() {
    const rejectDisabled = (operation) => async () => {
        throw new NonProductionAdapterError(operation)
    }

    return Object.freeze({
        enabled: false,
        run: rejectDisabled('run'),
        abort: rejectDisabled('abort')
    })
}

module.exports = {
    createNonProductionAdapter,
    NonProductionAdapterError,
    NON_PRODUCTION_ADAPTER_DEPENDENCIES
}
