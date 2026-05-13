import { useEscClose } from './Toast'

export default function ShortcutsPanel({ onClose }) {
  useEscClose(onClose)
  const groups = [
    {
      title: 'Navigation',
      rows: [
        ['Arrow keys', 'Move cell by cell'],
        ['Ctrl + Arrow', 'Jump to edge of data'],
        ['Page Up / Down', 'Scroll one page up / down'],
        ['Tab / Shift+Tab', 'Move right / left'],
        ['Home / End', 'First / last column in row'],
        ['Ctrl+Home / End', 'First / last cell in grid'],
      ],
    },
    {
      title: 'Selection',
      rows: [
        ['Click', 'Select cell'],
        ['Shift + Click', 'Select range'],
        ['Shift + Arrow', 'Extend selection'],
        ['Ctrl+Shift+Arrow', 'Extend to edge'],
        ['Ctrl + A', 'Select all cells'],
        ['Escape', 'Deselect'],
      ],
    },
    {
      title: 'Filters',
      rows: [
        ['Alt + ↓', 'Open value filter picker for column'],
        ['Ctrl+Shift+L', 'Clear all filters'],
        ['Ctrl+Shift+F', 'Toggle advanced filter panel'],
      ],
    },
    {
      title: 'Data & App',
      rows: [
        ['Ctrl + F', 'Focus search bar'],
        ['Ctrl + C', 'Copy selected cells'],
        ['Ctrl + E', 'Export CSV'],
        ['Escape', 'Clear search (when search focused)'],
        ['?', 'Show this shortcuts panel'],
      ],
    },
  ]

  return (
    <div className="pp-overlay" onMouseDown={onClose}>
      <div className="shortcuts-panel" onMouseDown={e => e.stopPropagation()}>
        <div className="pp-header">
          <span className="pp-title">⌨️ Keyboard Shortcuts</span>
          <button className="bp-close" onClick={onClose}>✕</button>
        </div>
        <div className="shortcuts-body">
          {groups.map(g => (
            <div key={g.title} className="shortcuts-group">
              <div className="shortcuts-group-title">{g.title}</div>
              <table className="shortcuts-table">
                <tbody>
                  {g.rows.map(([keys, desc]) => (
                    <tr key={keys}>
                      <td className="shortcuts-keys">
                        {keys.split('+').map((k, i) => (
                          <span key={i}>
                            {i > 0 && <span className="shortcuts-plus">+</span>}
                            <kbd className="shortcuts-kbd">{k.trim()}</kbd>
                          </span>
                        ))}
                      </td>
                      <td className="shortcuts-desc">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <div className="shortcuts-footer">Press <kbd className="shortcuts-kbd">?</kbd> or <kbd className="shortcuts-kbd">Escape</kbd> to close</div>
      </div>
    </div>
  )
}
