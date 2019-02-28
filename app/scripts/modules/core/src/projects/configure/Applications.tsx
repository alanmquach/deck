import * as React from 'react';
import { FormikErrors, getIn, FormikProps } from 'formik';
import { isEqual } from 'lodash';

import { IProject, IProjectPipeline } from 'core/domain';
import { IWizardPageComponent } from 'core/modal';
import { FormikApplicationsPicker } from 'core/projects/configure/FormikApplicationsPicker';
import { buildValidators, ArrayItemValidator, Validation } from 'core/presentation';

export interface IApplicationsProps {
  formik: FormikProps<IProject>;
  allApplications: string[];
  onApplicationsChanged: (applications: string[]) => void;
}

export class Applications extends React.Component<IApplicationsProps> implements IWizardPageComponent<IProject> {
  public validate(project: IProject): FormikErrors<IProject> {
    const { oneOf } = Validation;

    const builder = buildValidators(project);
    const { arrayForEach } = builder;

    const applicationValidator: ArrayItemValidator = applicationBuilder => {
      applicationBuilder
        .item('Application')
        .validate([oneOf(this.props.allApplications, 'This application does not exist.')]);
    };

    builder.field('config.applications', 'Applications').validate([arrayForEach(applicationValidator)]);

    return builder.result();
  }

  public componentDidMount() {
    const apps = getIn(this.props.formik.values, 'config.applications', []);
    this.props.onApplicationsChanged && this.props.onApplicationsChanged(apps);
  }

  public componentDidUpdate(prevProps: IApplicationsProps) {
    const prevApps = getIn(prevProps.formik.values, 'config.applications', []);
    const nextApps = getIn(this.props.formik.values, 'config.applications', []);

    if (!isEqual(prevApps, nextApps)) {
      this.props.onApplicationsChanged && this.props.onApplicationsChanged(nextApps);
      // Remove any pipelines associated with the applications removed.
      const existingPipelineConfigs: IProjectPipeline[] = getIn(this.props.formik.values, 'config.pipelineConfigs', []);
      const newPipelineConfigs = existingPipelineConfigs.filter(({ application }) => nextApps.includes(application));
      this.props.formik.setFieldValue('config.pipelineConfigs', newPipelineConfigs);
    }
  }

  public render() {
    const { allApplications } = this.props;

    return (
      <FormikApplicationsPicker
        className="ConfigureProject-Applications"
        name="config.applications"
        applications={allApplications}
      />
    );
  }
}
