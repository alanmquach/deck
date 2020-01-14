import * as React from 'react';
import { Dropdown } from 'react-bootstrap';

import {
  Details,
  CollapsibleSection,
  ILoadBalancer,
  Application,
  LoadBalancerReader,
  ManagedResourceDetailsIndicator,
} from '@spinnaker/core';

import { IAmazonLoadBalancerSourceData, ITargetGroup, IListenerAction, IAmazonLoadBalancer } from 'amazon/domain';
import { LoadBalancerActions } from './LoadBalancerActions';

export interface ILoadBalancerFromStateParams {
  accountId: string;
  region: string;
  name: string;
}

export interface IActionDetails extends IListenerAction {
  targetGroup: ITargetGroup;
}

export interface IAmazonLoadBalancerDetailsProps {
  app: Application;
  loadBalancer: ILoadBalancerFromStateParams;
}

export interface IAmazonLoadBalancerDetailState {
  loading: boolean;
  loadBalancer: IAmazonLoadBalancer;
  loadBalancerSourceData: IAmazonLoadBalancerSourceData;
  dataSourceUnsubscribe?: () => void;
}

export class AmazonLoadBalancerDetails extends React.Component<
  IAmazonLoadBalancerDetailsProps,
  IAmazonLoadBalancerDetailState
> {
  constructor(props: IAmazonLoadBalancerDetailsProps) {
    super(props);
    this.state = {
      loading: true,
      loadBalancer: undefined,
      loadBalancerSourceData: undefined,
    };
  }

  public extractLoadBalancer(): void {
    const { app, loadBalancer: loadBalancerFromProps } = this.props;
    const loadBalancer: IAmazonLoadBalancer = app.loadBalancers.data.find((test: ILoadBalancer) => {
      return (
        test.name === loadBalancerFromProps.name &&
        test.region === loadBalancerFromProps.region &&
        test.account === loadBalancerFromProps.accountId
      );
    });

    if (loadBalancer) {
      LoadBalancerReader.getLoadBalancerDetails(
        'aws',
        loadBalancerFromProps.accountId,
        loadBalancerFromProps.region,
        loadBalancerFromProps.name,
      ).then((details: IAmazonLoadBalancerSourceData[]) => {
        if (details.length) {
          this.setState({
            loading: false,
            loadBalancer,
            loadBalancerSourceData: details[0],
          });
        }
      });
    }
  }

  public componentDidMount(): void {
    const { app } = this.props;
    const dataSource = app.loadBalancers;
    dataSource.ready().then(() => {
      const dataSourceUnsubscribe = dataSource.onRefresh(null, () => this.extractLoadBalancer());
      this.setState({ dataSourceUnsubscribe });
      this.extractLoadBalancer();
    });
  }

  public componentWillUnmount() {
    // is this actually necessary?
    this.state.dataSourceUnsubscribe && this.state.dataSourceUnsubscribe();
  }

  public render() {
    const { loading, loadBalancer, loadBalancerSourceData } = this.state;
    if (loading) {
      // Don't bother computing any children if we're loading
      return <Details loading={loading} />;
    }

    const loadBalancerDetailsSection = <CollapsibleSection heading="Load Balancer Details">foo</CollapsibleSection>;

    return (
      <Details loading={this.state.loading}>
        <Details.Header icon={<i className="fa icon-sitemap" />} name={this.state.loadBalancer.name}>
          <div className="actions">
            <LoadBalancerActions
              app={this.props.app}
              loadBalancer={this.state.loadBalancer}
              loadBalancerFromParams={this.props.loadBalancer}
            />
            <Dropdown className="dropdown" id="insight-links-menu">
              <Dropdown.Toggle className="btn btn-sm btn-default dropdown-toggle">Insight</Dropdown.Toggle>
              <Dropdown.Menu className="dropdown-menu">
                {loadBalancerSourceData.insightActions.map((action, i) => (
                  <li key={i}>
                    <a target="_blank" href={action.url}>
                      {action.label}
                    </a>
                  </li>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          </div>
        </Details.Header>
        {loadBalancer.entityTags && <ManagedResourceDetailsIndicator entityTags={loadBalancer.entityTags} />}
        <div className="content">{loadBalancerDetailsSection}</div>
      </Details>
    );
  }
}
