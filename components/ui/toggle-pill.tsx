'use client'

import { useState } from 'react'

interface TogglePillProps {
  options: [string, string]
  defaultValue?: 0 | 1
  onChange?: (index: 0 | 1) => void
  className?: string
}

export function TogglePill({
  options,
  defaultValue = 0,
  onChange,
  className = '',
}: TogglePillProps) {
  const [selected, setSelected] = useState<0 | 1>(defaultValue)

  const handleSelect = (index: 0 | 1) => {
    setSelected(index)
    onChange?.(index)
  }

  return (
    <div
      className={`inline-flex items-center rounded-full p-1 ${className}`}
      style={{
        background: 'linear-gradient(-75deg, rgba(255,255,255,0.03), rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow:
          'rgba(0,0,0,0.2) 0px 2px 4px 0px, rgba(255,255,255,0.05) 0px 0px 1.6px 4px inset, rgba(0,0,0,0.3) 0px 1px 2px 0px inset',
      }}
    >
      {options.map((option, index) => (
        <button
          key={option}
          onClick={() => handleSelect(index as 0 | 1)}
          className={`
            px-4 py-2 text-sm font-mono rounded-full transition-all duration-300
            ${
              selected === index
                ? 'bg-[#c9a882] text-[#1a1614] font-medium shadow-md'
                : 'text-stone-400 hover:text-stone-200'
            }
          `}
          style={
            selected === index
              ? {}
              : {
                  background: 'transparent',
                }
          }
        >
          {option}
        </button>
      ))}
    </div>
  )
}
