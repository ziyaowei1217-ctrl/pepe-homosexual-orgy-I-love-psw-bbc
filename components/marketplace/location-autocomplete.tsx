"use client";

import { MapPin } from "lucide-react";
import { useId, useMemo, useState, type FocusEvent, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";
import { searchUSMarkets, type USMarket } from "@/lib/us-market-catalog";

export function LocationAutocomplete({
  name,
  ariaLabel,
  placeholder,
  value,
  defaultValue = "",
  onValueChange,
  inputClassName
}: {
  name: string;
  ariaLabel: string;
  placeholder: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  inputClassName?: string;
}) {
  const listboxId = useId();
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const currentValue = value ?? internalValue;
  const suggestions = useMemo(() => getLocationSuggestions(currentValue), [currentValue]);
  const expanded = open && suggestions.length > 0;

  function updateValue(nextValue: string) {
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  }

  function choose(option: USMarket) {
    updateValue(option.label);
    setOpen(false);
    setHighlightedIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!expanded) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(suggestions[highlightedIndex] ?? suggestions[0]);
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }

  return (
    <div className="relative min-w-0" onBlur={handleBlur}>
      <input
        name={name}
        value={currentValue}
        onChange={(event) => {
          updateValue(event.target.value);
          setHighlightedIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-activedescendant={expanded ? `${listboxId}-${suggestions[highlightedIndex]?.id}` : undefined}
        autoComplete="off"
        className={cn("w-full bg-transparent outline-none", inputClassName)}
        placeholder={placeholder}
      />
      {expanded ? (
        <div id={listboxId} role="listbox" aria-label="地点建议" className="absolute left-0 top-[calc(100%+12px)] z-[90] min-w-[270px] overflow-hidden rounded-[20px] border border-slate-200 bg-white p-2 text-left shadow-[0_22px_60px_rgba(15,23,42,0.18)]">
          {suggestions.map((option, index) => (
            <button
              key={option.id}
              id={`${listboxId}-${option.id}`}
              type="button"
              role="option"
              aria-selected={index === highlightedIndex}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => choose(option)}
              className={cn("flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left", index === highlightedIndex ? "bg-blue-50" : "hover:bg-slate-50")}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-100 text-[#0668e1]"><MapPin className="size-4" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-black text-slate-950">{option.label}</span>
                <span className="block text-xs font-semibold text-slate-500">{option.region}</span>
                <span className="mt-0.5 block truncate text-[11px] text-slate-400">{option.highlights.join(" · ")}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getLocationSuggestions(value: string) {
  return searchUSMarkets(value);
}
