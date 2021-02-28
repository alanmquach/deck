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

export const traverseLineage = (execution: IExecution): string[] => {
  const lineage: string[] = [];
  if (!execution) {
    return lineage;
  }
  let current = execution;
  lineage.unshift(current.id);
  while (current.trigger?.parentExecution) {
    current = current.trigger.parentExecution;
    lineage.unshift(current.id);
  }
  return lineage;
};

export const ExecutionLineage = (props: IExecutionLineageProps) => {
  const { executionService } = ReactInjector;
  const { app, execution, showDurations } = props;

  const [ancestry, setAncestry] = useState([] as IExecution[]);
  //eslint-disable-next-line
  console.log(`ExecutionLineage render() ancestry=${ancestry.length}`);
  useEffect(() => {
    const lineage = traverseLineage(execution);

    // Executions by ID
    const lineageCache = ancestry.reduce(
      (acc, curr) => {
        acc[curr.id] = curr;
        return acc;
      },
      {
        [execution.id]: execution,
      },
    );

    Promise.all(
      lineage.map((generation) =>
        lineageCache[generation]
          ? Promise.resolve(lineageCache[generation])
          : executionService.getExecution(generation).then((ancestor) => {
              ExecutionsTransformer.transformExecution(app, ancestor);
              return ancestor;
            }),
      ),
    ).then((fetchedAncestry) => setAncestry(fetchedAncestry));
  }, [props.execution.id]);

  return (
    <div>
      {/* <pre>{execution.id}</pre>
        <pre>{JSON.stringify(traverseLineage(execution))}</pre> */}
      {ancestry.length > 0 &&
        ancestry.map(
          (ancestor, i) =>
            i < ancestry.length - 1 && (
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
            ),
        )}
    </div>
  );
};
