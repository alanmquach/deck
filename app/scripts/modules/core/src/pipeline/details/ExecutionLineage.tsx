import React, { useEffect, useState } from 'react';

import { Application } from 'core/application/application.model';
import { IExecution, IPipeline } from 'core/domain';
import { ISortFilter } from 'core/filterModel';
import { Tooltip } from 'core/presentation';
import { IStateChange, ReactInjector } from 'core/reactShims';
import { IScheduler, SchedulerFactory } from 'core/scheduler';
import { ExecutionState } from 'core/state';

import { ISingleExecutionRouterStateChange } from './SingleExecutionDetails';
import { Execution } from '../executions/execution/Execution';
import { ManualExecutionModal } from '../manualExecution';
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
  // Including the deepest child (topmost, aka current, execution) in the lineage lets us
  // also cache it inside ancestry through the below effect.
  // This buys us snappier navigation to descendants because the entire lineage is already local
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
  const [eagerExecutionId, setEagerExecutionId] = useState('');
  //eslint-disable-next-line
  console.log(`ExecutionLineage render() ancestry=${ancestry.length}`);

  useEffect(() => {
    //eslint-disable-next-line
    console.log(`${Date.now()} ExecutionLineage useEffect() subscribed`);
    const subscription = ReactInjector.stateEvents.stateChangeSuccess.subscribe(
      (stateChange: ISingleExecutionRouterStateChange) => setEagerExecutionId(stateChange.toParams.executionId),
    );
    return () => {
      //eslint-disable-next-line
      console.log(`${Date.now()} ExecutionLineage useEffect() unsubscribed`);
      subscription.unsubscribe();
    };
  }, [ancestry]);

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

  // <ExecutionLineage> does not need to render the deepest child (aka current execution), so we drop the last element
  let truncateAncestry = ancestry.length - 1;
  if (eagerExecutionId && eagerExecutionId !== execution.id) {
    // We are on the eager end of a transition to a different executionId
    const idx = ancestry.findIndex((a) => a.id === eagerExecutionId);
    if (idx > -1) {
      // The incoming executionId is part of the ancestry, so we can eagerly truncate it for a smoother transition
      truncateAncestry = idx + 1;
    }
  }

  return (
    <div>
      {ancestry
        .filter((_ancestor, i) => i < truncateAncestry)
        .map((ancestor, i) => (
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
  );
};
