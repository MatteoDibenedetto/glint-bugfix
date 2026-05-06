'use client'

import { useState } from 'react'
import type { FileFix } from '@/types'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface DiffViewerProps {
  fixes: FileFix[]
  editable?: boolean
  onChange?: (fixes: FileFix[]) => void
}

function computeLineDiff(original: string, modified: string) {
  const origLines = original.split('\n')
  const modLines = modified.split('\n')
  const result: { type: 'unchanged' | 'removed' | 'added'; line: string }[] = []
  const maxLen = Math.max(origLines.length, modLines.length)
  for (let i = 0; i < maxLen; i++) {
    const o = origLines[i]
    const m = modLines[i]
    if (o === undefined) {
      result.push({ type: 'added', line: m })
    } else if (m === undefined) {
      result.push({ type: 'removed', line: o })
    } else if (o === m) {
      result.push({ type: 'unchanged', line: o })
    } else {
      result.push({ type: 'removed', line: o })
      result.push({ type: 'added', line: m })
    }
  }
  return result
}

function FileDiff({ fix, editable, onUpdate }: {
  fix: FileFix
  editable?: boolean
  onUpdate?: (updated: FileFix) => void
}) {
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(fix.modified_content)
  const diff = computeLineDiff(fix.original_content, fix.modified_content)
  const changes = diff.filter((l) => l.type !== 'unchanged').length

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/8 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown size={14} className="text-glint-grey" /> : <ChevronRight size={14} className="text-glint-grey" />}
          <code className="text-sm text-glint-yellow font-mono">{fix.file}</code>
          <span className="text-xs text-glint-grey">{changes} modifiche</span>
        </div>
        {editable && (
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(!editing) }}
            className="text-xs text-glint-grey hover:text-white px-2 py-1 rounded border border-white/10 hover:border-white/20 transition-colors"
          >
            {editing ? 'Annulla' : 'Modifica'}
          </button>
        )}
      </button>

      {open && (
        <div>
          {/* Explanation */}
          {fix.explanation && (
            <div className="px-4 py-2 bg-glint-yellow/5 border-b border-white/8">
              <p className="text-xs text-glint-grey">{fix.explanation}</p>
            </div>
          )}

          {editing ? (
            <div className="p-4">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded font-mono text-xs text-white p-3 focus:outline-none focus:border-glint-yellow/60 resize-none"
                rows={20}
              />
              <button
                onClick={() => {
                  onUpdate?.({ ...fix, modified_content: editValue })
                  setEditing(false)
                }}
                className="mt-2 text-sm bg-glint-orange text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors"
              >
                Salva modifiche
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <tbody>
                  {diff.map((line, i) => (
                    <tr
                      key={i}
                      className={
                        line.type === 'added'
                          ? 'bg-green-500/10'
                          : line.type === 'removed'
                          ? 'bg-red-500/10'
                          : ''
                      }
                    >
                      <td className="select-none w-8 px-3 py-0.5 text-right text-white/20 border-r border-white/5">
                        {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ''}
                      </td>
                      <td className={`px-4 py-0.5 whitespace-pre ${
                        line.type === 'added' ? 'text-green-400' :
                        line.type === 'removed' ? 'text-red-400' : 'text-white/70'
                      }`}>
                        {line.line}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function DiffViewer({ fixes, editable, onChange }: DiffViewerProps) {
  const [localFixes, setLocalFixes] = useState(fixes)

  function handleUpdate(index: number, updated: FileFix) {
    const next = localFixes.map((f, i) => (i === index ? updated : f))
    setLocalFixes(next)
    onChange?.(next)
  }

  return (
    <div className="space-y-3">
      {localFixes.map((fix, i) => (
        <FileDiff
          key={fix.file}
          fix={fix}
          editable={editable}
          onUpdate={(updated) => handleUpdate(i, updated)}
        />
      ))}
    </div>
  )
}
