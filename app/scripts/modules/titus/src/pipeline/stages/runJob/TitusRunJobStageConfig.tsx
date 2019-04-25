import * as React from 'react';
import { cloneDeep, defaultsDeep, forOwn } from 'lodash';

import {
  AccountTag,
  IStageConfigProps,
  RegionSelectInput,
  HelpField,
  IAggregatedAccounts,
  IRegion,
  AccountService,
  FirewallLabels,
  MapEditor,
  AccountSelectInput,
  FormikStageConfig,
  FormikFormField,
  IStage,
  IFormikStageConfigInjectedProps,
  IContextualValidator,
  NumberInput,
  TextInput,
  CheckboxInput,
  buildValidators,
} from '@spinnaker/core';

import { DockerImageAndTagSelector, DockerImageUtils, IDockerImageAndTagChanges } from '@spinnaker/docker';

import { TitusSecurityGroupPicker } from './TitusSecurityGroupPicker';
import { TitusProviderSettings } from '../../../titus.settings';

export interface ITitusRunJobStageConfigState {
  credentials: string[];
  regions: IRegion[];
  loaded: boolean;
}

interface IClusterDefaults {
  application: string;
  containerAttributes: object;
  env: object;
  labels: object;
  resources: {
    cpu: number;
    disk: number;
    gpu: number;
    memory: number;
    networkMbps: number;
  };
  retries: number;
  runtimeLimitSecs: number;
  securityGroups: string[];
  iamProfile?: string;
}

export class TitusRunJobStageConfig extends React.Component<IStageConfigProps> {
  private stage: IStage;

  public constructor(props: IStageConfigProps) {
    super(props);
    const { application, stage: initialStageConfig } = props;
    const stage = cloneDeep(initialStageConfig);
    stage.cluster = stage.cluster || {};
    stage.waitForCompletion = stage.waitForCompletion === undefined ? true : stage.waitForCompletion;

    if (stage.cluster.imageId && !stage.cluster.imageId.includes('${')) {
      Object.assign(stage, DockerImageUtils.splitImageId(stage.cluster.imageId));
    }

    if (!stage.credentials && application.defaultCredentials.titus) {
      stage.credentials = application.defaultCredentials.titus;
    }

    if (!stage.cluster.capacity) {
      stage.cluster.capacity = {
        min: 1,
        max: 1,
        desired: 1,
      };
    }

    const defaultIamProfile = (TitusProviderSettings.defaults.iamProfile || '{{application}}InstanceProfile').replace(
      '{{application}}',
      application.name,
    );

    const clusterDefaults: IClusterDefaults = {
      application: application.name,
      containerAttributes: {},
      env: {},
      labels: {},
      resources: {
        cpu: 1,
        disk: 10000,
        gpu: 0,
        memory: 512,
        networkMbps: 128,
      },
      retries: 0,
      runtimeLimitSecs: 3600,
      securityGroups: [] as string[],
    };

    if (stage.isNew) {
      clusterDefaults.iamProfile = defaultIamProfile;
    }

    defaultsDeep(stage.cluster, clusterDefaults);

    stage.cloudProvider = stage.cloudProvider || 'titus';
    stage.deferredInitialization = true;
    // Intentionally initializing the stage config only once in the constructor
    // The stage config is then completely owned within FormikStageConfig's Formik state
    this.stage = stage;
  }

  public render() {
    const stage = this.stage;
    return (
      <FormikStageConfig
        stage={stage}
        {...this.props}
        onChange={this.props.updateStage}
        validate={validate}
        render={formik => <ConfigureTitusRunJobStage {...formik} />}
      />
    );
  }
}

export const validate: IContextualValidator = stage => {
  const validation = buildValidators(stage);
  validation.field('cluster.iamProfile', 'IAM Instance Profile').required();
  validation.field('cluster.imageId', 'Image ID').required();
  validation.field('credentials', 'Account').required();
  validation.field('cluster.region', 'Region').required();
  validation.field('cluster.resources.cpu', 'CPU(s)').required();
  validation.field('cluster.resources.gpu', 'GPU(s)').required();
  validation.field('cluster.resources.memory', 'Memory').required();
  validation.field('cluster.resources.disk', 'Disk').required();
  validation.field('cluster.runtimeLimitSecs', 'Runtime Limit').required();
  return validation.result();
};

class ConfigureTitusRunJobStage extends React.Component<IFormikStageConfigInjectedProps, ITitusRunJobStageConfigState> {
  private credentialsKeyedByAccount: IAggregatedAccounts = {};

  public state: ITitusRunJobStageConfigState = {
    credentials: [],
    regions: [],
    loaded: false,
  };

  public componentDidMount() {
    const {
      formik: { values, setFieldValue },
    } = this.props;
    AccountService.getCredentialsKeyedByAccount('titus').then(credentialsKeyedByAccount => {
      this.credentialsKeyedByAccount = credentialsKeyedByAccount;
      const credentials = Object.keys(credentialsKeyedByAccount);
      const selectedCredentials = values.credentials || credentials[0];
      setFieldValue('credentials', selectedCredentials);
      this.setRegistry(selectedCredentials);
      this.updateRegions(selectedCredentials);
      this.setState({ credentials, loaded: true });
    });
  }

  private setRegistry(account: string) {
    if (account) {
      this.props.formik.setFieldValue('registry', this.credentialsKeyedByAccount[account].registry);
    }
  }

  private updateRegions(account: string) {
    const {
      formik: { values: stage, setFieldValue },
    } = this.props;
    let regions: IRegion[];
    if (account) {
      regions = this.credentialsKeyedByAccount[account].regions;
      if (regions.map(r => r.name).every(r => r !== stage.cluster.region)) {
        setFieldValue('cluster.region', undefined);
      }
    } else {
      regions = [];
    }
    this.setState({ regions });
  }

  private accountChanged(account: string) {
    // Duplicating 'credentials' into 'account'. This should really be shimmed in a service instead.
    this.props.formik.setFieldValue('account', account);
    this.setRegistry(account);
    this.updateRegions(account);
  }

  private dockerChanged = (changes: IDockerImageAndTagChanges) => {
    // Temporary until stage config section is no longer angular
    const { imageId, ...rest } = changes;
    forOwn(rest, (value, key) => this.props.formik.setFieldValue(key, value));
    if (imageId) {
      this.props.formik.setFieldValue('cluster.imageId', imageId);
    } else {
      this.props.formik.setFieldValue('cluster.imageId', undefined);
    }
  };

  public render() {
    const { application, formik } = this.props;
    const { values: stage } = formik;
    const { credentials, loaded, regions } = this.state;
    const awsAccount = (this.credentialsKeyedByAccount[stage.credentials] || { awsAccount: '' }).awsAccount;
    const defaultIamProfile = (TitusProviderSettings.defaults.iamProfile || '{{application}}InstanceProfile').replace(
      '{{application}}',
      application.name,
    );

    if (!loaded) {
      return null;
    }

    return (
      <div className="form-horizontal">
        <FormikFormField
          name="credentials"
          label="Account"
          input={props => (
            <>
              <AccountSelectInput accounts={credentials} provider="titus" {...props} />
              {stage.credentials !== undefined && (
                <div className="small">
                  Uses resources from the Amazon account <AccountTag account={awsAccount} />
                </div>
              )}
            </>
          )}
          onChange={this.accountChanged}
        />

        <FormikFormField
          name="cluster.region"
          label="Region"
          fastField={false}
          input={props => <RegionSelectInput account={stage.credentials} regions={regions} {...props} />}
          onChange={region => this.props.formik.setFieldValue('region', region)}
        />

        <DockerImageAndTagSelector
          specifyTagByRegex={false}
          account={stage.credentials}
          digest={stage.digest}
          imageId={stage.cluster.imageId}
          organization={stage.organization}
          registry={stage.registry}
          repository={stage.repository}
          tag={stage.tag}
          showRegistry={false}
          onChange={this.dockerChanged}
          deferInitialization={stage.deferredInitialization}
          labelClass="col-md-2 col-md-offset-1 sm-label-right"
          fieldClass="col-md-6"
        />

        <FormikFormField
          name="cluster.resources.cpu"
          label="CPU(s)"
          input={props => <NumberInput {...props} />}
          required={true}
        />

        <FormikFormField
          name="cluster.resources.memory"
          label="Memory (MB)"
          input={props => <NumberInput {...props} />}
          required={true}
        />

        <FormikFormField
          name="cluster.resources.disk"
          label="Disk (MB)"
          input={props => <NumberInput {...props} />}
          required={true}
        />

        <FormikFormField
          name="cluster.resources.networkMbps"
          label="Network (Mbps)"
          help={<HelpField id="titus.deploy.network" />}
          input={props => <NumberInput {...props} />}
          required={true}
        />

        <FormikFormField
          name="cluster.resources.gpu"
          label="GPU(s)"
          help={<HelpField id="titus.deploy.gpu" />}
          input={props => <NumberInput {...props} />}
          required={true}
        />

        <FormikFormField name="cluster.entryPoint" label="Entrypoint" input={props => <TextInput {...props} />} />

        <FormikFormField
          name="cluster.runtimeLimitSecs"
          label="Runtime Limit (Seconds)"
          help={<HelpField id="titus.deploy.runtimeLimitSecs" />}
          input={props => <NumberInput {...props} min={1} />}
          required={true}
        />

        <FormikFormField
          name="cluster.retries"
          label="Retries"
          help={<HelpField id="titus.deploy.retries" />}
          input={props => <NumberInput {...props} min={0} />}
          required={true}
        />

        <FormikFormField
          name="propertyFile"
          label="Property File"
          help={<HelpField id="titus.deploy.propertyFile" />}
          input={props => <TextInput {...props} />}
        />

        {/* This should only be local state, but it's also nice to have your "show advanced" preference persisted */}
        <FormikFormField
          name="showAdvancedOptions"
          input={props => <CheckboxInput {...props} text="Show Advanced Options" />}
        />

        <div className={`${stage.showAdvancedOptions === true ? 'collapse.in' : 'collapse'}`}>
          <FormikFormField
            name="cluster.iamProfile"
            label="IAM Instance Profile"
            help={<HelpField id="titus.deploy.iamProfile" />}
            input={props => (
              <>
                <TextInput {...props} />
                in <AccountTag account={awsAccount} />
                {!stage.isNew && !stage.cluster.iamProfile && (
                  <>
                    <input
                      type="checkbox"
                      onChange={() => this.props.formik.setFieldValue('cluster.iamProfile', defaultIamProfile)}
                    />
                    Use default
                  </>
                )}
              </>
            )}
          />

          <FormikFormField
            name="cluster.capacityGroup"
            label="Capacity Group"
            help={<HelpField id="titus.job.capacityGroup" />}
            input={props => <TextInput {...props} />}
          />

          <FormikFormField
            name="cluster.securityGroups"
            label={FirewallLabels.get('Firewalls')}
            help={<HelpField id="titus.job.securityGroups" />}
            input={({ name, value }) => (
              <>
                {(!stage.credentials || !stage.cluster.region) && (
                  <div>Account and region must be selected before {FirewallLabels.get('firewalls')} can be added</div>
                )}
                {loaded && stage.credentials && stage.cluster.region && (
                  <TitusSecurityGroupPicker
                    account={stage.credentials}
                    region={stage.cluster.region}
                    command={stage}
                    amazonAccount={awsAccount}
                    hideLabel={true}
                    groupsToEdit={value}
                    onChange={groups => this.props.formik.setFieldValue(name, groups)}
                  />
                )}
              </>
            )}
          />

          <FormikFormField
            name="cluster.labels"
            label="Job Attributes (optional)"
            input={({ name, value }) => (
              <MapEditor
                model={value}
                allowEmpty={true}
                onChange={(v: any) => this.props.formik.setFieldValue(name, v)}
              />
            )}
          />

          <FormikFormField
            name="cluster.containerAttributes"
            label="Container Attributes (optional)"
            input={({ name, value }) => (
              <MapEditor
                model={value}
                allowEmpty={true}
                onChange={(v: any) => this.props.formik.setFieldValue(name, v)}
              />
            )}
          />

          <FormikFormField
            name="cluster.env"
            label="Environment Variables (optional)"
            input={({ name, value }) => (
              <MapEditor
                model={value}
                allowEmpty={true}
                onChange={(v: any) => this.props.formik.setFieldValue(name, v)}
              />
            )}
          />
        </div>

        <FormikFormField
          name="waitForCompletion"
          label="Wait for results"
          help={<HelpField id="titus.job.waitForCompletion" />}
          input={props => <CheckboxInput {...props} />}
        />
      </div>
    );
  }
}
