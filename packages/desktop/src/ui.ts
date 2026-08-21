import type { Child } from "@onestack/core";
import { Button, View } from "@onestack/ui";
import { dialog } from "./dialog.js";

export interface NativeTitleBarProps extends Record<string, unknown> {
  children?: Child;
}

export function NativeTitleBar(props: NativeTitleBarProps) {
  return View({
    ...props,
    role: props.role ?? "banner",
    "data-onestack-native-titlebar": "true",
  });
}

export interface NativeMenuProps extends Record<string, unknown> {
  children?: Child;
}

export function NativeMenu(props: NativeMenuProps) {
  return View({
    ...props,
    role: props.role ?? "menubar",
    "data-onestack-native-menu": "true",
  });
}

export interface NativeFilePickerProps extends Record<string, unknown> {
  label?: string;
  multiple?: boolean;
  onSelect?: (paths: string[] | null) => void;
}

export function NativeFilePicker(props: NativeFilePickerProps) {
  const { label = "Choose file", multiple = false, onSelect, ...rest } = props;
  return Button({
    ...rest,
    onClick: async () => onSelect?.(await dialog.openFile({ multiple })),
    children: label,
  });
}
