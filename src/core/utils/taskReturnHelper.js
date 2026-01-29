export function useTaskReturn() {
  function returnToPrevious() {
    if (window.history.length > 1) {
      window.history.back()
    } else {
      window.location.href = '/'
    }
  }

  return { returnToPrevious }
}
