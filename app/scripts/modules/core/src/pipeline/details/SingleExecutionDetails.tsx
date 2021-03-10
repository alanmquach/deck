import { UISref } from '@uirouter/react';
import { set } from 'lodash';
import React from 'react';
import ReactGA from 'react-ga';
import { Subscription } from 'rxjs';

import { Application } from 'core/application/application.model';
import { IExecution, IPipeline } from 'core/domain';
import { ISortFilter } from 'core/filterModel';
import { Tooltip, useData, useLatestPromise } from 'core/presentation';
import { IStateChange, ReactInjector } from 'core/reactShims';
import { IScheduler, SchedulerFactory } from 'core/scheduler';
import { ExecutionState } from 'core/state';

import { Execution } from '../executions/execution/Execution';
import { ManualExecutionModal } from '../manualExecution';
import { ExecutionsTransformer } from '../service/ExecutionsTransformer';

import './singleExecutionDetails.less';

export interface ISingleExecutionDetailsProps {
  app: Application;
}

export interface ISingleExecutionDetailsState {
  execution: IExecution;
  pipelineConfig?: IPipeline;
  sortFilter: ISortFilter;
  stateNotFound: boolean;
  ancestry: IExecution[];
  transitioningToAncestor: boolean;
  incomingExecutionId: string;
}

export interface ISingleExecutionStateParams {
  application: string;
  executionId: string;
}

export interface ISingleExecutionRouterStateChange extends IStateChange {
  fromParams: ISingleExecutionStateParams;
  toParams: ISingleExecutionStateParams;
}

//TODO: Limit the lineage to some max generations so we don't overwhelm ourselves
function traverseLineage(execution: IExecution): string[] {
  const lineage: string[] = [];
  if (!execution) {
    return lineage;
  }
  let current = execution;
  // Including the deepest child (topmost, aka current, execution) in the lineage lets us
  // also cache it as part of the ancestry state (we just don't render it).
  // This buys us snappier navigation to descendants because the entire lineage will be local.
  lineage.unshift(current.id);
  while (current.trigger?.parentExecution) {
    current = current.trigger.parentExecution;
    lineage.unshift(current.id);
  }
  return lineage;
}

export function SingleExecutionDetails(props: ISingleExecutionDetailsProps) {
  const ancestryRef = React.useRef([] as IExecution[]);
  const scheduler = SchedulerFactory.createScheduler(5000);
  const { executionService, $state } = ReactInjector;
  const { app } = props;

  const [transitioningToAncestor, setTransitioningToAncestor] = React.useState('');
  const [showDurations, setShowDurations] = React.useState(
    ExecutionState.filterModel.asFilterModel.sortFilter.showDurations,
  );

  const [executionId, setExecutionId] = React.useState($state.params.executionId);

  // eslint-disable-next-line
  const log = console.log;

  const getAncestry = (execution: IExecution): Promise<IExecution[]> => {
    const youngest = ancestryRef.current[ancestryRef.current.length - 1];
    const useAncestryCache = execution && youngest && youngest.id !== execution.id;
    log(`getAncestry(): using ancestry cache? ${useAncestryCache}`);
    const lineage = traverseLineage(execution);
    log(`getAncestry(): lineage(${execution?.id}) = [${lineage.join(',')}]`);

    // ancestryCache is used when navigating between executions
    const ancestryCache = ancestryRef.current.reduce((acc, curr) => set(acc, curr.id, curr), {
      [execution.id]: execution,
    });

    // inactiveCache is used to skip re-fetching ancestors that are no longer active
    const inactiveCache = ancestryRef.current
      .filter((ancestor) => !ancestor.isActive)
      .reduce((acc, curr) => set(acc, curr.id, curr), { [execution.id]: execution });

    const cache = useAncestryCache ? ancestryCache : inactiveCache;

    log(
      `getAncestry(): [${useAncestryCache ? 'x' : ' '}] ancestryRef=[${ancestryRef.current
        .map((a) => a.id)
        .join(',')}]`,
    );
    log(
      `getAncestry(): [${useAncestryCache ? ' ' : 'x'}] inactiveRef=[${ancestryRef.current
        .filter((a) => !a.isActive)
        .map((a) => a.id)
        .join(',')}]`,
    );
    log(`getAncestry(): fetches should go out for lineage - (one of the above) - execution.id (${execution?.id})`);
    return Promise.all(
      lineage.map((generation) =>
        cache[generation]
          ? Promise.resolve(cache[generation])
          : ReactInjector.executionService.getExecution(generation).then((ancestor) => {
              log(`getAncestry(): getExecution(${generation}) returned`);
              ExecutionsTransformer.transformExecution(app, ancestor);
              return ancestor;
            }),
      ),
    ).then((ancestry) => {
      log(`getAncestry(): setting new ancestryRef=[${ancestry.map((a) => a.id).join(',')}]`);
      ancestryRef.current = ancestry;
      return ancestry;
    });
  };

  const { result: execution, status, refresh: refreshExecution } = useLatestPromise(() => {
    const trace = Date.now();
    log(`${new Date().toString()} ${trace} useLatestPromise(asdf): about to getExecution(${executionId})`);
    return executionService.getExecution(executionId).then((fetchedExecution) => {
      log(
        `${new Date().toString()} ${trace} useLatestPromise(getExecution) run, ${executionId}:${
          fetchedExecution.id
        }, about to resolve, tta=${transitioningToAncestor}`,
      );
      if (fetchedExecution.id === transitioningToAncestor) {
        log(
          `${new Date().toString()} ${trace} useLatestPromise(getExecution) execution (${
            fetchedExecution.id
          }) matched, would've blanked out tta`,
        );
        // setTransitioningToAncestor('');
      }
      ExecutionsTransformer.transformExecution(app, fetchedExecution);
      return fetchedExecution;
    });
  }, [executionId]);

  const stateNotFound = status === 'REJECTED';

  const { result: ancestry } = useData(
    () => {
      const shouldUseCache = execution && execution.id !== executionId;
      log(`getting ancestry... shouldUseCache?${shouldUseCache} --- ${execution.id} ?= ${executionId}`);
      return getAncestry(execution).then((ancestry) => {
        log(`getAncestry done`);
        return ancestry;
      });
    },
    [],
    [execution, executionId],
  );

  const everything = [execution].concat(ancestry);
  log(`SchedulerFactory everything=${everything.map((x) => x?.id).join(',')}`);
  log(`SchedulerFactory active=${everything.map((x) => x?.isActive)}`);
  const someActive = [execution]
    .concat(ancestry)
    .filter((x) => x)
    .some((x) => x.isActive);
  log(`SchedulerFactory someActive=${someActive}`);

  React.useEffect(() => {
    const tracer = Date.now();
    log(`SchedulerFactory ${tracer} effect run, someActive=${someActive}`); // if this didn't change then it would be becvause we got a new execution and thusly a new refresher
    //TODO: need to make sure scheduler/subscription looks at both execution and ancestry
    const subscription =
      someActive &&
      scheduler.subscribe(() => {
        log(`SchedulerFactory asdf: refreshing on schedule, look for next useLatestPromise?`);
        refreshExecution();
      });

    return () => {
      log(`SchedulerFactory ${tracer} cleaning up`); // if this didn't change then it would be becvause we got a new execution and thusly a new refresher
      subscription && subscription.unsubscribe();
    };
  }, [someActive]);

  React.useEffect(() => {
    const subscription = ReactInjector.stateEvents.stateChangeSuccess.subscribe(
      (stateChange: ISingleExecutionRouterStateChange) => {
        if (
          !stateChange.to.name.includes('pipelineConfig') &&
          !stateChange.to.name.includes('executions') &&
          (stateChange.toParams.application !== stateChange.fromParams.application ||
            stateChange.toParams.executionId !== stateChange.fromParams.executionId)
        ) {
          setExecutionId(stateChange.toParams.executionId);
          const lineage = traverseLineage(execution);
          log(
            `stateChangeSubscription: asdf transitioning to ${stateChange.toParams.executionId} <- ${stateChange.fromParams.executionId}`,
          );
          log(`stateChangeSubscription: lineage for ${execution?.id}=[${lineage.join(',')}]`);
          if (lineage.includes(stateChange.toParams.executionId)) {
            log(`stateChangeSubscription: lineage includes ${stateChange.toParams.executionId} setting tta=true`);
            setTransitioningToAncestor(stateChange.toParams.executionId);
          }
        }
      },
    );
    return () => {
      subscription.unsubscribe();
    };
  }, [execution]);

  React.useEffect(() => {
    log(
      `one of these changed: (not) useLatestPromise transitioningToAncestor=${transitioningToAncestor} execution.id=${execution?.id}, running effect`,
    );
    if (transitioningToAncestor === execution?.id) {
      log(
        `one of these changed: (not) useLatestPromise they match, so finally blanking out tta, hopefully post render cycle`,
      );
      setTransitioningToAncestor('');
    }
  }, [transitioningToAncestor, execution?.id]);

  React.useEffect(() => {
    ExecutionState.filterModel.asFilterModel.sortFilter.showDurations = showDurations;
  }, [showDurations]);

  const { result: pipelineConfigs } = useLatestPromise<IPipeline[]>(() => {
    app.pipelineConfigs.activate();
    return app.pipelineConfigs.ready();
  }, []);
  const pipelineConfig =
    pipelineConfigs && execution && pipelineConfigs.find((p: IPipeline) => p.id === execution.pipelineConfigId);

  const defaultExecutionParams = { application: app.name, executionId: execution?.id || '' };
  const executionParams = ReactInjector.$state.params.executionParams || defaultExecutionParams;

  let truncateAncestry = ancestry.length - 1;
  if (executionId && execution && executionId !== execution.id) {
    // We are on the eager end of a transition to a different executionId
    const idx = ancestry.findIndex((a) => a.id === executionId);
    if (idx > -1) {
      // If the incoming executionId is part of the ancestry, we can eagerly truncate the ancestry at that generation
      // for a smoother experience during the transition. That is, if we are navigating from e to b in [a, b, c, d, e],
      // [a, b, c, d] is rendered as part of the ancestry, while [e] is the main execution.
      // We eagerly truncate the ancestry to [a, b] since that will be the end state anyways (transitioningToAncestor hides [e])
      // Once [b] loads, the ancestry is recomputed to just [a] and the rendered executions remain [a, b]
      truncateAncestry = idx + 1;
      log(`render() truncateAncestry eagerly due to navigating to ancestor`);
    }
  }

  log(`render() truncateAncestry(${truncateAncestry}) ancestry=[${ancestry.map((a) => a.id).join(',')}]`);
  log(`render() asdf executionId=(${executionId})`);
  log(`render() (not) useLatestPromise execution.id=(${execution?.id}) tta=(${transitioningToAncestor})`);
  log(
    `render() (not) useLatestPromise can i has render? ${
      !transitioningToAncestor || transitioningToAncestor === execution.id
    }`,
  );

  // Eagerly hide the main execution when we are transitioning to an ancestor and are not rendering that ancestor
  // Once we've reached it, an effect will re-setTransitioningToAncestor to blank
  const hideMainExecution = !(!transitioningToAncestor || transitioningToAncestor === execution.id);

  return (
    <div style={{ width: '100%', paddingTop: 0 }}>
      {execution && (
        <div className="row">
          <div className="col-md-10 col-md-offset-1">
            <div className="single-execution-details">
              <div className="flex-container-h baseline">
                <h3>
                  <Tooltip value="Back to Executions">
                    <UISref to="^.executions.execution" params={executionParams}>
                      <a className="btn btn-configure">
                        <span className="glyphicon glyphicon glyphicon-circle-arrow-left" />
                      </a>
                    </UISref>
                  </Tooltip>
                  {execution.name}
                </h3>

                <div className="form-group checkbox flex-pull-right">
                  <label>
                    <input
                      type="checkbox"
                      checked={showDurations || false}
                      onChange={(evt) => setShowDurations(evt.target.checked)}
                    />
                    <span> stage durations</span>
                  </label>
                </div>
                <Tooltip value="Navigate to Pipeline Configuration">
                  <UISref
                    to="^.pipelineConfig"
                    params={{ application: app.name, pipelineId: execution.pipelineConfigId }}
                  >
                    <button
                      className="btn btn-sm btn-default single-execution-details__configure"
                      onClick={(e) => {
                        ReactGA.event({ category: 'Execution', action: 'Configuration' });
                        ReactInjector.$state.go('^.pipelineConfig', {
                          application: app.name,
                          pipelineId: execution.pipelineConfigId,
                        });
                        e.stopPropagation();
                      }}
                    >
                      <span className="glyphicon glyphicon-cog" />
                      <span className="visible-md-inline visible-lg-inline"> Configure</span>
                    </button>
                  </UISref>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
      )}
      {execution &&
        ancestry
          .filter((_ancestor, i) => i < truncateAncestry)
          .map((ancestor, i) => (
            <div className="row" key={ancestor.id}>
              <div className="col-md-10 col-md-offset-1 executions">
                <Execution
                  key={ancestor.id}
                  execution={ancestor}
                  descendantExecutionId={i < ancestry.length - 1 ? ancestry[i + 1].id : execution.id}
                  application={app}
                  pipelineConfig={null}
                  standalone={true}
                  showDurations={showDurations}
                />
              </div>
            </div>
          ))}
      {execution && !hideMainExecution && (
        <div className="row">
          <div className="col-md-10 col-md-offset-1 executions">
            <Execution
              execution={execution}
              key={execution.id}
              application={app}
              pipelineConfig={null}
              standalone={true}
              showDurations={showDurations}
              onRerun={
                pipelineConfig &&
                (() => {
                  ManualExecutionModal.show({
                    pipeline: pipelineConfig,
                    application: app,
                    trigger: execution.trigger,
                  }).then((command) => {
                    const { executionService } = ReactInjector;
                    executionService.startAndMonitorPipeline(app, command.pipelineName, command.trigger);
                    ReactInjector.$state.go('^.^.executions');
                  });
                })
              }
            />
          </div>
        </div>
      )}
      {stateNotFound && (
        <div className="row" style={{ minHeight: '300px' }}>
          <h4 className="text-center">
            <p>The execution cannot be found.</p>
            <UISref to="^.executions" params={{ application: app.name }}>
              <a>Back to Executions.</a>
            </UISref>
          </h4>
        </div>
      )}
    </div>
  );
}
