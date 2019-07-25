import * as React from 'react';
import { UISref } from '@uirouter/react';
import { Dropdown } from 'react-bootstrap';
import { head, sortBy, orderBy } from 'lodash';
import * as classNames from 'classnames';

import {
  Details,
  CollapsibleSection,
  ILoadBalancer,
  Application,
  AccountTag,
  LoadBalancerReader,
  IApplicationSecurityGroup,
  timestamp,
  ISubnet,
  SubnetReader,
  SecurityGroupReader,
  ManagedResourceDetailsIndicator,
  HealthCounts,
  CopyToClipboard,
  SETTINGS,
  FirewallLabels,
} from '@spinnaker/core';

import { VpcTag } from 'amazon/vpc/VpcTag';
import {
  IAmazonLoadBalancerSourceData,
  IApplicationLoadBalancerSourceData,
  ITargetGroup,
  IListenerAction,
  IAmazonApplicationLoadBalancer,
  IClassicLoadBalancerSourceData,
  IAmazonLoadBalancer,
} from 'amazon/domain';
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
  subnetDetails: { [key: string]: ISubnet };
  loadBalancer: any;
  ipAddressTypeDescription: string; // maybe does not even need to be in state
  elbProtocol: string; // maybe does not even need to be in state
  listeners: any;
  securityGroups: any;
}

export class AmazonLoadBalancerDetails extends React.Component<
  IAmazonLoadBalancerDetailsProps,
  IAmazonLoadBalancerDetailState
> {
  constructor(props: IAmazonLoadBalancerDetailsProps) {
    super(props);
    this.state = {
      loading: true,
      subnetDetails: {},
      loadBalancer: undefined,
      ipAddressTypeDescription: undefined,
      elbProtocol: undefined,
      listeners: undefined,
      securityGroups: undefined,
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
        const securityGroups: IApplicationSecurityGroup[] = [];
        if (details.length) {
          loadBalancer.elb = details[0];
          loadBalancer.elb.vpcId = loadBalancer.elb.vpcId || loadBalancer.elb.vpcid;
          loadBalancer.account = loadBalancerFromProps.accountId;

          const sourceData = details[0] as IApplicationLoadBalancerSourceData;
          const computed: any = {};
          if (sourceData.loadBalancerType === 'application' || sourceData.loadBalancerType === 'network') {
            // Transform listener data
            const elb = details[0] as IApplicationLoadBalancerSourceData;
            if (elb.listeners && elb.listeners.length) {
              computed.elbProtocol = 'http:';
              if (elb.listeners.some((l: any) => l.protocol === 'HTTPS')) {
                computed.elbProtocol = 'https:';
              }

              computed.listeners = [];

              // Sort the actions by the order specified since amazon does not return them in order of order
              elb.listeners.forEach(l => {
                l.defaultActions.sort((a, b) => a.order - b.order);
                l.rules.forEach(r => r.actions.sort((a, b) => a.order - b.order));
              });

              elb.listeners.forEach(listener => {
                listener.rules.map(rule => {
                  let inMatch = [
                    listener.protocol,
                    (rule.conditions.find(c => c.field === 'host-header') || { values: [''] }).values[0],
                    listener.port,
                  ]
                    .filter(f => f)
                    .join(':');
                  const path = (rule.conditions.find(c => c.field === 'path-pattern') || { values: [] }).values[0];
                  if (path) {
                    inMatch = `${inMatch}${path}`;
                  }
                  const actions = rule.actions.map(a => {
                    const action = { ...a } as IActionDetails;
                    if (action.type === 'forward') {
                      action.targetGroup = (loadBalancer as IAmazonApplicationLoadBalancer).targetGroups.find(
                        tg => tg.name === action.targetGroupName,
                      );
                    }
                    return action;
                  });
                  computed.listeners.push({ in: inMatch, actions });
                });
              });
            }

            if (elb.ipAddressType === 'dualstack') {
              computed.ipAddressTypeDescription = 'IPv4 and IPv6';
            }
            if (elb.ipAddressType === 'ipv4') {
              computed.ipAddressTypeDescription = 'IPv4';
            }
          } else {
            // Classic
            const elb = details[0] as IClassicLoadBalancerSourceData;
            if (elb.listenerDescriptions) {
              computed.elbProtocol = 'http';
              if (elb.listenerDescriptions.some((l: any) => l.listener.protocol === 'HTTPS')) {
                computed.elbProtocol = 'https';
              }
            }
          }

          (loadBalancer.elb.securityGroups || []).forEach((securityGroupId: string) => {
            const match = SecurityGroupReader.getApplicationSecurityGroup(
              app,
              loadBalancerFromProps.accountId,
              loadBalancerFromProps.region,
              securityGroupId,
            );
            if (match) {
              securityGroups.push(match);
            }
          });
          computed.securityGroups = sortBy(securityGroups, 'name');

          if (loadBalancer.subnets) {
            loadBalancer.subnetDetails = loadBalancer.subnets.forEach((subnetId: string) => {
              SubnetReader.getSubnetByIdAndProvider(subnetId, loadBalancer.provider).then((subnetDetail: ISubnet) => {
                const subnetDetails = this.state.subnetDetails;
                subnetDetails[subnetId] = subnetDetail;
                this.setState({ subnetDetails });
                // subnetDetails.push(subnetDetail);
              });
            });
          }

          const { elbProtocol, listeners, ipAddressTypeDescription } = computed;
          this.setState({
            loadBalancer,
            elbProtocol,
            listeners,
            ipAddressTypeDescription,
            securityGroups: computed.securityGroups,
            loading: false,
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
    this.state.dataSourceUnsubscribe && this.state.dataSourceUnsubscribe();
  }

  private getFirstSubnetPurpose(subnetList: string[] = []) {
    const subnetDetailsList = subnetList.map(subnetId => this.state.subnetDetails[subnetId] || { purpose: subnetId });
    return head(subnetDetailsList.map(subnet => subnet.purpose)) || '';
  }

  public render() {
    const { loading, loadBalancer, ipAddressTypeDescription, elbProtocol, listeners, securityGroups } = this.state;
    if (loading) {
      // Don't bother computing any children if we're loading
      return <Details loading={loading} />;
    }

    const loadBalancerDetails = (
      <>
        <dl className="dl-horizontal dl-flex">
          <dt>Created</dt>
          <dd>{timestamp(loadBalancer.elb.createdTime)}</dd>
          <dt>In</dt>
          <dd>
            <AccountTag account={loadBalancer.account} /> {loadBalancer.region}
          </dd>
          <dt>VPC</dt>
          <dd>
            <VpcTag vpcId={loadBalancer.elb.vpcId} />
          </dd>
          <dt>Subnet</dt>
          <dd>{this.getFirstSubnetPurpose(loadBalancer.subnets)}</dd>
          {ipAddressTypeDescription && (
            <>
              <dt>Type</dt>
              <dd>{loadBalancer.loadBalancerType}</dd>
              <dt>IP Type</dt>
              <dd>{ipAddressTypeDescription}</dd>
            </>
          )}
        </dl>
        <dl className="horizontal-when-filters-collapsed">
          <dt>Availability Zones</dt>
          <dd>
            <ul className="collapse-margin-on-filter-collapse">
              {loadBalancer.elb.availabilityZones.map(az => (
                <li key={az}>{az}</li>
              ))}
            </ul>
          </dd>
        </dl>
        {loadBalancer.serverGroups && loadBalancer.serverGroups.length > 0 && (
          <dl className="horizontal-when-filters-collapsed">
            <dt>Server Groups</dt>
            <dd>
              <ul className="collapse-margin-on-filter-collapse">
                {orderBy(loadBalancer.serverGroups, ['isDisabled', 'name'], ['asc', 'desc']).map(serverGroup => (
                  <li key={serverGroup.name}>
                    <UISref
                      to="^.serverGroup"
                      params={{
                        region: serverGroup.region,
                        accountId: serverGroup.account,
                        serverGroup: serverGroup.name,
                        provider: 'aws',
                      }}
                    >
                      <a>{serverGroup.name}</a>
                    </UISref>
                  </li>
                ))}
              </ul>
            </dd>
          </dl>
        )}
        {loadBalancer.targetGroups && loadBalancer.targetGroups.length > 0 && (
          <dl className="horizontal-when-filters-collapsed">
            <dt>Target Groups</dt>
            <dd>
              <ul className="collapse-margin-on-filter-collapse">
                {orderBy(loadBalancer.targetGroups, ['isDisabled', 'name'], ['asc', 'desc']).map(targetGroup => (
                  <li key={targetGroup.name}>
                    <UISref
                      to="^.targetGroupDetails"
                      params={{
                        region: targetGroup.region,
                        loadBalancerName: loadBalancer.name,
                        accountId: targetGroup.account,
                        name: targetGroup.name,
                        vpcId: targetGroup.vpcId,
                        provider: 'aws',
                      }}
                    >
                      <a>{targetGroup.name}</a>
                    </UISref>
                  </li>
                ))}
              </ul>
            </dd>
          </dl>
        )}
        {loadBalancer.elb && loadBalancer.elb.dnsname && (
          <dl className="horizontal-when-filters-collapsed">
            <dt>DNS Name</dt>
            <dd>
              <a target="_blank" href={`${elbProtocol}://${loadBalancer.elb.dnsname}`}>
                {loadBalancer.elb.dnsname}
              </a>{' '}
              <CopyToClipboard text={loadBalancer.elb.dnsname} toolTip="Copy DNS Name to clipboard" />
            </dd>
          </dl>
        )}
      </>
    );

    const loadBalancerDetailsSection = (
      <CollapsibleSection heading="Load Balancer Details">{loadBalancerDetails}</CollapsibleSection>
    );

    const statusDetailsSection = (
      <CollapsibleSection heading="Status">
        {loadBalancer.loadBalancerType === 'classic' ? (
          <HealthCounts container={loadBalancer.instanceCounts} />
        ) : (
          'Select a target group to check the instance health status from the view of the target group.'
        )}
      </CollapsibleSection>
    );

    const listenersDetailsSection = (
      <CollapsibleSection heading="Listeners">
        {loadBalancer.loadBalancerType === 'classic' ? (
          <dl>
            <dt>Load Balancer &rarr; Instance</dt>
            {loadBalancer.elb.listenerDescriptions.map((listener, i) => (
              <dd key={i}>
                {listener.listener.protocol}:{listener.listener.loadBalancerPort} &rarr;{' '}
                {listener.listener.instanceProtocol}:{listener.listener.instancePort}
              </dd>
            ))}
          </dl>
        ) : (
          <>
            {listeners.map((listener, i) => (
              <div key={i}>
                <div className="listener-targets">{listener.in} &rarr;</div>
                <div className="listener-targets">
                  {listener.actions.map((action, j) => (
                    <div key={j}>
                      {action.type === 'redirect' && (
                        <span>
                          {action.redirectConfig.protocol !== listener.protocol && (
                            <span>{action.redirectConfig.protocol}:</span>
                          )}
                          {action.redirectConfig.host !== '#{host}' && <span>{action.redirectConfig.host}</span>}
                          {action.redirectConfig.port !== '#{port}' && <span>{action.redirectConfig.port}</span>}
                          {action.redirectConfig.path !== '/#{path}' && <span>{action.redirectConfig.path}</span>}
                          {action.redirectConfig.query !== '#{query}' && <span>?{action.redirectConfig.query}</span>}
                        </span>
                      )}
                      {action.type === 'authenticate-oidc' && (
                        <>
                          <i className="fas fa-fw fa-user-lock" />
                          {SETTINGS.oidcConfigPath ? (
                            <a
                              href={`${SETTINGS.oidcConfigPath}${action.authenticateOidcConfig.clientId}`}
                              target="_blank"
                            >
                              {action.authenticateOidcConfig.clientId}
                            </a>
                          ) : (
                            <span>{action.authenticateOidcConfig.clientId}</span>
                          )}
                        </>
                      )}
                      {action.targetGroupName && (
                        <>
                          <i className="fa fa-fw fa-crosshairs icon" aria-hidden="true" />
                          {action.targetGroup ? (
                            <UISref
                              to="^.targetGroupDetails"
                              params={{
                                region: action.targetGroup.region,
                                loadBalancerName: loadBalancer.name,
                                accountId: action.targetGroup.account,
                                name: action.targetGroup.name,
                                vpcId: action.targetGroup.vpcId,
                                provider: 'aws',
                              }}
                            >
                              <a>{action.targetGroupName}</a>
                            </UISref>
                          ) : (
                            action.targetGroupName
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </CollapsibleSection>
    );

    const securityGroupsDetailsSection = loadBalancer.loadBalancerType !== 'network' && (
      <CollapsibleSection heading={FirewallLabels.get('Firewalls')}>
        <ul>
          {orderBy(securityGroups, ['name']).map(securityGroup => (
            <li key={securityGroup.id}>
              <UISref
                to="^.firewallDetails"
                params={{
                  name: securityGroup.name,
                  accountId: loadBalancer.account,
                  region: loadBalancer.region,
                  vpcId: loadBalancer.vpcId,
                  provider: loadBalancer.provider,
                }}
              >
                <a>
                  {securityGroup.name} ({securityGroup.id})
                </a>
              </UISref>
            </li>
          ))}
        </ul>
      </CollapsibleSection>
    );

    const subnetDetailsSection = (
      <CollapsibleSection heading="Subnets">
        {loadBalancer.subnets.length === 0 ? (
          <div>
            <h5>No subnets</h5>
          </div>
        ) : (
          <>
            {loadBalancer.subnets
              .map(subnetId => this.state.subnetDetails[subnetId] || { id: subnetId })
              .map((subnet, index) => (
                <div
                  key={subnet.id}
                  className={classNames({ 'bottom-border': index < loadBalancer.subnets.length - 1 })}
                >
                  <h5>
                    <strong>{subnet.id}</strong>
                  </h5>
                  <dl className="dl-horizontal dl-flex">
                    <dt>Purpose</dt>
                    <dd>{subnet.purpose}</dd>

                    <dt>State</dt>
                    <dd>{subnet.state}</dd>

                    <dt>Cidr Block</dt>
                    <dd>{subnet.cidrBlock}</dd>
                  </dl>
                </div>
              ))}
          </>
        )}
      </CollapsibleSection>
    );

    const healthchecksDetailsSection = loadBalancer.loadBalancerType === 'classic' && (
      <CollapsibleSection heading="Health Checks">
        <dl className="horizontal-when-filters-collapsed">
          <dt>Target</dt>
          <dd>{loadBalancer.elb.healthCheck.target}</dd>
          <dt>Timeout</dt>
          <dd>{loadBalancer.elb.healthCheck.timeout} seconds</dd>
          <dt>Interval</dt>
          <dd>{loadBalancer.elb.healthCheck.interval} seconds</dd>
          <dt>Healthy Threshold</dt>
          <dd>{loadBalancer.elb.healthCheck.healthyThreshold}</dd>
          <dt>Unhealthy Threshold</dt>
          <dd>{loadBalancer.elb.healthCheck.unhealthyThreshold}</dd>
        </dl>
      </CollapsibleSection>
    );

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
              <Dropdown.Menu alignRight={true} className="dropdown-menu">
                {loadBalancer.elb.insightActions.map((action, i) => (
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
        <div className="content">
          {loadBalancerDetailsSection}
          {statusDetailsSection}
          {listenersDetailsSection}
          {securityGroupsDetailsSection}
          {subnetDetailsSection}
          {healthchecksDetailsSection}
        </div>
      </Details>
    );
  }
}
