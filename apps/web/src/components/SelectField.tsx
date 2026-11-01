import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

// Kept out of ui.tsx: that module is in the entry chunk, and Base UI's Select
// should only load on the pages that show one.

export interface SelectOption {
  value: string;
  label: string;
}

/** shadcn Select (Base UI) from a list of options. `items` is what makes the
 * trigger show the label: without it Base UI displays the raw value (an id). */
export function SelectField({
  value,
  onValueChange,
  options,
  placeholder,
  required,
  size,
  className = "w-full",
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  required?: boolean;
  size?: "sm" | "default";
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Select
      // Base UI treats null, not "", as "nothing selected".
      value={value === "" ? null : value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
      items={options}
      required={required}
    >
      <SelectTrigger size={size} className={className} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Options whose label is the value itself, e.g. role statuses. */
export const toOptions = (values: readonly string[]): SelectOption[] =>
  values.map((value) => ({ value, label: value }));
