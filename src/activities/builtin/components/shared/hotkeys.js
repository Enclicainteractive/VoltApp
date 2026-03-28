export const isEditableTarget = (target) => {
  if (!target || typeof target !== 'object') return false

  const element = target instanceof Element ? target : target?.parentElement
  if (!element) return false

  if (element.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]')) {
    return true
  }

  return !!element.isContentEditable
}

export const shouldIgnoreActivityHotkey = (event) => {
  if (!event) return false
  if (event.isComposing) return true
  return isEditableTarget(event.target)
}
