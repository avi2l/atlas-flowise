'use strict'

const DISABLED_CODE = 'ATLAS_AGENTFLOW_ADAPTER_DISABLED'

class NonProductionAdapterError extends Error {
    constructor() {
        super('The Atlas AgentFlow adapter is a non-production boundary skeleton and is disabled.')
        this.name = 'NonProductionAdapterError'
        this.code = DISABLED_CODE
    }
}

function createNonProductionAdapter() {
    const rejectDisabled = async () => {
        throw new NonProductionAdapterError()
    }

    return Object.freeze({
        enabled: false,
        run: rejectDisabled,
        abort: rejectDisabled
    })
}

module.exports = {
    createNonProductionAdapter,
    NonProductionAdapterError
}
