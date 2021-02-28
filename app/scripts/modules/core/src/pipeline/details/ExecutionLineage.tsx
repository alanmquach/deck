import React, { useState, useEffect } from 'react';

import { Application } from 'core/application/application.model';
import { IExecution, IPipeline } from 'core/domain';
import { Execution } from '../executions/execution/Execution';
import { IScheduler, SchedulerFactory } from 'core/scheduler';
import { ManualExecutionModal } from '../manualExecution';
import { ReactInjector, IStateChange } from 'core/reactShims';
import { Tooltip } from 'core/presentation';
import { ISortFilter } from 'core/filterModel';
import { ExecutionState } from 'core/state';
import { ExecutionsTransformer } from '../service/ExecutionsTransformer';

export interface IExecutionLineageProps {
    app: Application;
    execution: IExecution;
    showDurations: boolean;
}

const traverseLineage = (execution: IExecution): string[] => {
    const lineage: string[] = [];
    if (!execution) {
      return lineage;
    }
    let current = execution;
    while (current.trigger?.parentExecution) {
      current = current.trigger.parentExecution;
      lineage.unshift(current.id);
    }
    return lineage;
  };


export const ExecutionLineage = (props: IExecutionLineageProps) => {
    const { executionService } = ReactInjector;
    const { app, execution, showDurations } = props;

    const [ ancestry, setAncestry ] = useState([] as IExecution[]);

    useEffect(() => {
        const lineage = traverseLineage(execution);

        // Executions by ID
        const tmp = ancestry.reduce((acc, curr) => {
            acc[curr.id] = curr;
            return acc;
        }, {} as { [key: string]: IExecution });

        Promise.all(
            lineage.map((generation) => tmp[generation] ? Promise.resolve(tmp[generation]) : 
              executionService.getExecution(generation).then((ancestor) => {
                ExecutionsTransformer.transformExecution(app, ancestor);
                return ancestor;
              }),
            ),
        ).then((fetchedAncestry) => setAncestry(fetchedAncestry))
        }, [props.execution.id])

    return <div>
        <pre>{execution.id}</pre>
        <pre>{JSON.stringify(traverseLineage(execution))}</pre>
        {ancestry.length > 0 &&
          ancestry.map((ancestor, i) => (
            <div className="row" key={ancestor.id}>
              <div className="col-md-10 col-md-offset-1 executions">
                <Execution
                  key={ancestor.id}
                  execution={ancestor}
                  child={i < ancestry.length - 1 ? ancestry[i + 1].id : execution.id}
                  application={app}
                  pipelineConfig={null}
                  standalone={true}
                  showDurations={showDurations}
                />
              </div>
            </div>
          ))}
        </div>
}