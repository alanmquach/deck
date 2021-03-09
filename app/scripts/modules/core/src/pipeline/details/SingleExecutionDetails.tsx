import { UISref } from '@uirouter/react';
import React from 'react';
import ReactGA from 'react-ga';
import { Subscription } from 'rxjs';

import { Application } from 'core/application/application.model';
import { IExecution, IPipeline } from 'core/domain';
import { ISortFilter } from 'core/filterModel';
import { Tooltip } from 'core/presentation';
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

export class SingleExecutionDetails extends React.Component<
  ISingleExecutionDetailsProps,
  ISingleExecutionDetailsState
> {
  private executionScheduler: IScheduler;
  private executionLoader: Subscription;
  private stateChangeSuccessSubscription: Subscription;

  constructor(props: ISingleExecutionDetailsProps) {
    super(props);

    this.state = {
      execution: null,
      sortFilter: ExecutionState.filterModel.asFilterModel.sortFilter,
      stateNotFound: false,
      ancestry: [],
      transitioningToAncestor: false,
      incomingExecutionId: '',
    };
  }
  private traverseLineage(execution: IExecution): string[] {
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
  }

  private getAncestry(execution: IExecution, useAncestryCache = false): Promise<IExecution[]> {
    const lineage = this.traverseLineage(execution);
    const ancestryCache = this.state.ancestry.reduce(
      (acc, curr) => {
        acc[curr.id] = curr;
        return acc;
      },
      {
        // By sticking the current execution into the cache, we get snappy navigation to descendants
        [execution.id]: execution,
      },
    );
    const inactiveCache = this.state.ancestry.reduce(
      (acc, curr) => {
        if (!curr.isActive) {
          acc[curr.id] = curr;
        }
        return acc;
      },
      {
        // By sticking the current execution into the cache, we get snappy navigation to descendants
        [execution.id]: execution,
      },
    );
    const cache = useAncestryCache ? ancestryCache : inactiveCache;

    return Promise.all(
      lineage.map((generation) =>
        cache[generation]
          ? Promise.resolve(cache[generation])
          : ReactInjector.executionService.getExecution(generation).then((ancestor) => {
              ExecutionsTransformer.transformExecution(this.props.app, ancestor);
              return ancestor;
            }),
      ),
    );
  }

  private schedulePoller() {
    if (!this.executionScheduler) {
      this.executionScheduler = SchedulerFactory.createScheduler(5000);
      this.executionLoader = this.executionScheduler.subscribe(() => this.getExecution());
    }
  }

  private cancelPoller() {
    if (this.executionScheduler) {
      this.executionScheduler.unsubscribe();
      this.executionLoader.unsubscribe();
    }
  }

  private getExecution() {
    const { executionService, $state } = ReactInjector;
    const { app } = this.props;
    const { execution } = this.state;

    const incomingExecutionId = $state.params.executionId;

    if (!app || app.notFound || app.hasError) {
      return;
    }

    if (execution && execution.id !== incomingExecutionId) {
      // A little clunky, but provides a smoother experience when navigating up the lineage
      // This flag is used to eagerly hide then main execution when navigating to an ancestor
      if (this.traverseLineage(execution).includes(incomingExecutionId)) {
        this.setState({ transitioningToAncestor: true });
      }
      // Propagate the incoming executionId to state. We will check against this in the render() method
      this.setState({ incomingExecutionId });
    }

    // Since the poller is not cancelled until all ancestors are no longer active
    // when the main execution is not active, we can immediately resolve instead of refetching.
    (execution && execution.id === $state.params.executionId && !execution.isActive
      ? Promise.resolve(execution)
      : executionService.getExecution($state.params.executionId).then((fetchedExecution) => {
          ExecutionsTransformer.transformExecution(app, fetchedExecution);
          return fetchedExecution;
        })
    ).then(
      (fetchedExecution) => {
        const transitioning = execution.id !== $state.params.executionId;

        this.getAncestry(fetchedExecution, transitioning).then((ancestry) => {
          if ([fetchedExecution].concat(ancestry).every((generation) => !generation.isActive)) {
            this.cancelPoller();
          }
          if ([fetchedExecution].concat(ancestry).some((ancestor) => ancestor.isActive)) {
            this.schedulePoller();
          }
          this.setState({ ancestry });
        });
        if (fetchedExecution.isActive) {
          this.schedulePoller();
        }

        this.setState({ execution: fetchedExecution, transitioningToAncestor: false });

        app.pipelineConfigs.activate();
        app.pipelineConfigs.ready().then(() => {
          const pipelineConfig = app.pipelineConfigs.data.find(
            (p: IPipeline) => p.id === fetchedExecution.pipelineConfigId,
          );
          this.setState({ pipelineConfig });
        });
      },
      () => {
        this.setState({ execution: null, stateNotFound: true, transitioningToAncestor: false });
      },
    );
  }

  public componentDidMount(): void {
    this.stateChangeSuccessSubscription = ReactInjector.stateEvents.stateChangeSuccess.subscribe(
      (stateChange: ISingleExecutionRouterStateChange) => {
        if (
          !stateChange.to.name.includes('pipelineConfig') &&
          !stateChange.to.name.includes('executions') &&
          (stateChange.toParams.application !== stateChange.fromParams.application ||
            stateChange.toParams.executionId !== stateChange.fromParams.executionId)
        ) {
          this.getExecution();
        }
      },
    );
    this.getExecution();
  }

  public componentWillUnmount(): void {
    if (this.executionScheduler) {
      this.executionScheduler.unsubscribe();
    }
    if (this.executionLoader) {
      this.executionLoader.unsubscribe();
    }
    this.stateChangeSuccessSubscription.unsubscribe();
  }

  private showDurationsChanged = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const checked = event.target.checked;
    // TODO: Since we treat sortFilter like a store, we can force the setState for now
    //       but we should eventually convert all the sortFilters to be a valid redux
    //       (or similar) store.
    this.state.sortFilter.showDurations = checked;
    this.setState({ sortFilter: this.state.sortFilter });
    ReactGA.event({ category: 'Pipelines', action: 'Toggle Durations', label: checked.toString() });
  };

  private handleConfigureClicked = (e: React.MouseEvent<HTMLElement>): void => {
    ReactGA.event({ category: 'Execution', action: 'Configuration' });
    ReactInjector.$state.go('^.pipelineConfig', {
      application: this.props.app.name,
      pipelineId: this.state.execution.pipelineConfigId,
    });
    e.stopPropagation();
  };

  private rerunExecution = (execution: IExecution) => {
    const { app } = this.props;
    const { pipelineConfig: pipeline } = this.state;

    ManualExecutionModal.show({
      pipeline: pipeline,
      application: app,
      trigger: execution.trigger,
    }).then((command) => {
      const { executionService } = ReactInjector;
      executionService.startAndMonitorPipeline(app, command.pipelineName, command.trigger);
      ReactInjector.$state.go('^.^.executions');
    });
  };

  public render() {
    const { app } = this.props;
    const {
      execution,
      pipelineConfig,
      sortFilter,
      stateNotFound,
      ancestry,
      transitioningToAncestor,
      incomingExecutionId,
    } = this.state;

    const defaultExecutionParams = { application: app.name, executionId: execution ? execution.id : '' };
    const executionParams = ReactInjector.$state.params.executionParams || defaultExecutionParams;

    let truncateAncestry = ancestry.length - 1;
    if (incomingExecutionId && incomingExecutionId !== execution.id) {
      // We are on the eager end of a transition to a different executionId
      const idx = ancestry.findIndex((a) => a.id === incomingExecutionId);
      if (idx > -1) {
        // If the incoming executionId is part of the ancestry, we can eagerly truncate the ancestry at that generation
        // for a smoother experience during the transition. That is, if we are navigating from e to b in [a, b, c, d, e],
        // [a, b, c, d] is rendered as part of the ancestry, while [e] is the main execution.
        // We eagerly truncate the ancestry to [a, b] since that will be the end state anyways (transitioningToAncestor hides [e])
        // Once [b] loads, the ancestry is recomputed to just [a] and the rendered executions remain [a, b]
        truncateAncestry = idx + 1;
      }
    }

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
                        checked={sortFilter.showDurations || false}
                        onChange={this.showDurationsChanged}
                      />
                      <span> stage durations</span>
                    </label>
                  </div>
                  <Tooltip value="Navigate to Pipeline Configuration">
                    <UISref
                      to="^.pipelineConfig"
                      params={{ application: this.props.app.name, pipelineId: this.state.execution.pipelineConfigId }}
                    >
                      <button
                        className="btn btn-sm btn-default single-execution-details__configure"
                        onClick={this.handleConfigureClicked}
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
                    showDurations={sortFilter.showDurations}
                  />
                </div>
              </div>
            ))}
        {execution && !transitioningToAncestor && (
          <div className="row">
            <div className="col-md-10 col-md-offset-1 executions">
              <Execution
                execution={execution}
                key={execution.id}
                application={app}
                pipelineConfig={null}
                standalone={true}
                showDurations={sortFilter.showDurations}
                onRerun={
                  pipelineConfig &&
                  (() => {
                    this.rerunExecution(execution);
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
}
