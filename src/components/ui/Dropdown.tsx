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

  // Close dropdown on click outside
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
        className={`w-full flex items-center justify-between py-2.5 pr-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-terracotta/20 transition-all bg-pure-white text-deep-ink text-left relative cursor-pointer ${
          icon ? 'pl-10' : 'pl-3'
        } ${
          touched && error
            ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
            : isOpen
              ? 'border-terracotta ring-2 ring-terracotta/20'
              : 'border-subtle-stone hover:border-muted-clay/40'
        }`}
      >
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none text-muted-clay/60">
            {icon}
          </div>
        )}
        <span
          className={`text-sm ${selectedOption ? 'text-obsidian font-medium' : 'text-muted-clay/40'}`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted-clay/60 transition-transform duration-300 ${isOpen ? 'transform rotate-180 text-terracotta' : ''}`}
        />
      </button>

      {isOpen && (
        <ul className="absolute z-50 w-full mt-1.5 bg-pure-white border border-subtle-stone rounded-md shadow-lg overflow-hidden py-1 animate-in fade-in slide-in-from-top-1 duration-150">
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer ${
                  option.value === value
                    ? 'bg-cream text-terracotta font-semibold'
                    : 'text-obsidian hover:bg-stone/50 hover:text-terracotta'
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
