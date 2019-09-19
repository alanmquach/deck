import * as React from 'react';
import Select from 'react-select';
import CreatableSelect, { Props as CreatableProps } from 'react-select/creatable';
import { List } from 'react-virtualized';
import { ActionMeta, ValueType } from 'react-select/src/types';
import { Props as SelectProps } from 'react-select/src/Select';

export interface IOption {
  label: string;
  value: OptionValues;
}
export type OptionValues = string | number | boolean;

export interface IReactSelectProps extends SelectProps<IOption> {
  creatable?: boolean;
  isMulti?: never; // never allow isMulti because we use different components
  onChange?: (value: IOption, actionMeta: ActionMeta) => void;
}

export interface IReactMultiSelectProps extends SelectProps<IOption> {
  creatable: boolean;
  isMulti: never; // never allow isMulti because we use different components
  onChange?: (value: IOption[], actionMeta: ActionMeta) => void;
}

export function findOption(value: OptionValues): (o: IOption) => boolean {
  return (o: IOption) => o.value === value;
}

export function ReactMultiSelect(props: IReactMultiSelectProps) {
  const { creatable = false, onChange, isMulti, ...commonPropsWithoutMulti } = props;
  const commonProps = {
    isMulti: true,
    onChange: (value: ValueType<IOption>, actionMeta: ActionMeta) => {
      if (onChange) {
        if (value == null) {
          onChange(value, actionMeta);
        } else if (Array.isArray(value)) {
          onChange(value[0], actionMeta);
        } else {
          onChange(value, actionMeta);
        }
      }
    },
    ...commonPropsWithoutMulti,
  };

  return creatable ? <Select {...commonProps} /> : <CreatableSelect onChange={onChange} {...commonProps} />;
}

export function ReactSelect(props: IReactSelectProps) {
  const { creatable = false, onChange, isMulti, ...commonPropsWithoutMulti } = props;
  const commonProps = {
    isMulti: false,
    onChange: (value: ValueType<IOption>, actionMeta: ActionMeta) => {
      if (onChange) {
        if (value == null) {
          onChange([], actionMeta);
        } else if (Array.isArray(value)) {
          onChange(value, actionMeta);
        } else {
          onChange(value, actionMeta);
        }
      }
    },
    ...commonPropsWithoutMulti,
  };

  return creatable ? <Select {...commonProps} /> : <CreatableSelect onChange={onChange} {...commonProps} />;
}
