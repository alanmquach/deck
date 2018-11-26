import * as React from 'react';

import { IStageConfigProps } from 'core/pipeline';
import { SpelNumberInput } from 'core/widgets/spelText/SpelNumberInput';
import { StageConfigField } from '../core/stageConfigField/StageConfigField';
import { FormikFormField, NumberInput, CheckboxInput, TextAreaInput } from 'core/presentation';
import { Formik } from 'formik';

export interface IWaitStageConfigState {
  enableCustomSkipWaitText: boolean;
}

export const DEFAULT_SKIP_WAIT_TEXT = 'The pipeline will proceed immediately, marking this stage completed.';

export class WaitStageConfig extends React.Component<IStageConfigProps, IWaitStageConfigState> {
  constructor(props: IStageConfigProps) {
    super(props);
    // this.state = { enableCustomSkipWaitText: !!props.stage.skipWaitText };
  }

  private updateWaitTime = (waitTime: number | string) => {
    this.props.updateStageField({ waitTime });
  };

  private toggleCustomSkipWaitText = (): void => {
    // this.setState({ enableCustomSkipWaitText: event.target.checked });
    this.props.updateStageField({ skipWaitText: undefined });
  };

  private customSkipWaitTextChanged = (value: string): void => {
    const skipWaitText = value || undefined;
    this.props.updateStageField({ skipWaitText });
  };

  public render() {
    // const { enableCustomSkipWaitText } = this.state;
    const { waitTime, skipWaitText } = this.props.stage;
    const initialValues = { waitTime, skipWaitText, enableCustomSkipWaitText: !!skipWaitText };
    // return <div></div>;

    return (
      <Formik
        initialValues={initialValues}
        onSubmit={() => {}}
        render={props => {
          const { values } = props;
          const { enableCustomSkipWaitText } = values;
          return (
            <div className="form-horizontal">
              <FormikFormField
                name="waitTime"
                label="Wait time (seconds)"
                input={props => <NumberInput {...props} min={0} />}
                onChange={this.updateWaitTime}
              />
              <FormikFormField
                name="enableCustomSkipWaitText"
                label=" "
                input={props => <CheckboxInput {...props} text="Show custom warning when users skip wait" />}
                onChange={this.toggleCustomSkipWaitText}
              />
              {enableCustomSkipWaitText && (
                <FormikFormField
                  name="skipWaitText"
                  label=" "
                  input={props => (
                    <TextAreaInput
                      {...props}
                      rows={4}
                      placeholder={`Default text: '${DEFAULT_SKIP_WAIT_TEXT}' (HTML is okay)`}
                    />
                  )}
                  onChange={this.customSkipWaitTextChanged}
                />
              )}
            </div>
          );
        }}
      />
    );

    // return (
    //   <Formik
    //     initialValues={initialValues}
    //     render={
    //       return (
    //         <div className="form-horizontal">
    //         <FormikFormField
    //           name="waitTime"
    //           label="Wait time (seconds)"
    //           input={props => <NumberInput {...props} min={0} />}
    //          />
    //       </div>
    //       );
    //     } />
    // );

    // return (
    //   <div className="form-horizontal">
    //     <StageConfigField label="Wait time (seconds)" fieldColumns={6}>
    //       <div>
    //         <SpelNumberInput value={waitTime} onChange={this.updateWaitTime} />
    //       </div>
    //     </StageConfigField>
    //     <div className="form-group">
    //       <div className="col-md-8 col-md-offset-3">
    //         <div className="checkbox">
    //           <label>
    //             <input type="checkbox" onChange={this.toggleCustomSkipWaitText} checked={enableCustomSkipWaitText} />
    //             <span> Show custom warning when users skip wait</span>
    //           </label>
    //         </div>
    //       </div>
    //       {enableCustomSkipWaitText && (
    //         <div className="col-md-8 col-md-offset-3 checkbox-padding">
    //           <textarea
    //             className="form-control"
    //             rows={4}
    //             placeholder={`Default text: '${DEFAULT_SKIP_WAIT_TEXT}' (HTML is okay)`}
    //             style={{ marginTop: '5px' }}
    //             value={skipWaitText}
    //             onChange={this.customSkipWaitTextChanged}
    //           />
    //         </div>
    //       )}
    //     </div>
    //   </div>
    // );
  }
}
