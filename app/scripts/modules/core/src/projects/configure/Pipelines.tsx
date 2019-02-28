import * as React from 'react';
import { FieldArray, FormikErrors, getIn } from 'formik';

import {
  FormikFormField,
  ReactSelectInput,
  StringsAsOptions,
  buildValidators,
  IArrayItemValidator,
  Validators,
} from 'core/presentation';
import { Spinner } from 'core/widgets';
import { IPipeline, IProject, IProjectPipeline } from 'core/domain';
import { IWizardPageComponent } from 'core/modal';

export interface IPipelinesProps {
  appsPipelines: {
    [appName: string]: IPipeline[];
  };
}

export class Pipelines extends React.Component<IPipelinesProps> implements IWizardPageComponent<IProject> {
  public validate = (value: IProject): FormikErrors<IProject> => {
    const { oneOf } = Validators;
    const builder = buildValidators(value);
    const { arrayForEach } = builder;

    const pipelineConfigValidator: IArrayItemValidator = (pipelineConfigBuilder, { application }: IProjectPipeline) => {
      const pipelineIdsForApp = (this.props.appsPipelines[application] || []).map(p => p.id);
      pipelineConfigBuilder
        .field('application', 'Application')
        .required(
          [oneOf(value.config.applications, 'This application is not part of the project')],
          'Application must be specified',
        );
      pipelineConfigBuilder
        .field('pipelineConfigId', 'Pipeline')
        .required(
          [oneOf(pipelineIdsForApp, `Pipeline does not exist in ${application}`)],
          'Pipeline must be specified',
        );
    };

    builder.field('config.pipelineConfigs', 'Pipeline config').optional([arrayForEach(pipelineConfigValidator)]);

    return builder.result();
  };

  public render() {
    const { appsPipelines } = this.props;

    const tableHeader = (
      <tr>
        <td>App</td>
        <td>Pipeline</td>
        <td style={{ width: '30px' }} />
      </tr>
    );

    const pipelineConfigsPath = 'config.pipelineConfigs';

    return (
      <FieldArray
        name={pipelineConfigsPath}
        render={pipelinesArrayHelper => {
          const project: IProject = pipelinesArrayHelper.form.values;
          const configs: IProjectPipeline[] = getIn(project, pipelineConfigsPath);
          const apps: string[] = getIn(project, 'config.applications');

          return (
            <div className="ConfigureProject-Pipelines vertical center">
              <div className="vertical center" style={{ width: '100%' }}>
                <table style={{ width: '100%' }} className="table-condensed">
                  <thead>{tableHeader}</thead>
                  <tbody>
                    {configs.map((config, idx) => {
                      const pipelinePath = `${pipelineConfigsPath}[${idx}]`;
                      const application = config && config.application;
                      const appPipelines = application && appsPipelines[application];
                      const pipelineOptions = appPipelines && appPipelines.map(p => ({ label: p.name, value: p.id }));

                      const key = `${application}-${config && config.pipelineConfigId}-${idx}`;

                      return (
                        <tr key={key}>
                          <td>
                            <FormikFormField
                              name={`${pipelinePath}.application`}
                              layout={({ input }) => <div>{input}</div>}
                              input={props => (
                                <StringsAsOptions strings={apps}>
                                  {options => <ReactSelectInput {...props} clearable={false} options={options} />}
                                </StringsAsOptions>
                              )}
                            />
                          </td>

                          <td>
                            {!application ? null : !pipelineOptions ? (
                              <Spinner />
                            ) : (
                              <FormikFormField
                                name={`${pipelinePath}.pipelineConfigId`}
                                layout={({ input }) => <div>{input}</div>}
                                input={props => (
                                  <ReactSelectInput {...props} clearable={false} options={pipelineOptions} />
                                )}
                              />
                            )}
                          </td>

                          <td>
                            <button className="nostyle" onClick={() => pipelinesArrayHelper.remove(idx)}>
                              <i className="fas fa-trash-alt" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <a
                  className="button zombie sp-margin-m horizontal middle center"
                  onClick={() => pipelinesArrayHelper.push({})}
                >
                  <i className="fas fa-plus-circle" /> Add Pipeline
                </a>
              </div>
            </div>
          );
        }}
      />
    );
  }
}
