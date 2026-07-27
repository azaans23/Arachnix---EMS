'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface DropdownOption {
  label: string;
  value: string;
}

interface CustomDropdownProps {
  id: string;
  name: string;
  placeholder?: string;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: string;
  touched?: boolean;
  icon?: React.ReactNode;
}

export default function CustomDropdown({
  placeholder = 'Select an option',
  options,
  value,
  onChange,
  onBlur,
  error,
  touched,
  icon,
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        onBlur();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onBlur]);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`relative flex w-full cursor-pointer items-center justify-between border bg-surface py-2.5 pr-3 text-left text-ink transition-all focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] ${
          icon ? 'pl-10' : 'pl-3'
        } rounded-md ${
          touched && error
            ? 'border-danger focus:border-danger'
            : isOpen
              ? 'border-ink/40 ring-2 ring-[var(--focus-ring)]'
              : 'border-border hover:border-ink/25'
        }`}
      >
        {icon && (
          <div className="pointer-events-none absolute left-3.5 top-1/2 flex -translate-y-1/2 items-center text-muted/60">
            {icon}
          </div>
        )}
        <span className={`text-sm ${selectedOption ? 'font-medium text-ink' : 'text-muted/50'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted transition-transform duration-200 ${isOpen ? 'rotate-180 text-ink' : ''}`}
        />
      </button>

      {isOpen && (
        <ul className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-md border border-border bg-surface py-1 shadow-panel animate-fade-in">
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full cursor-pointer px-4 py-2.5 text-left text-sm transition-colors ${
                  option.value === value
                    ? 'bg-canvas font-semibold text-ink'
                    : 'text-ink hover:bg-canvas'
                }`}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
