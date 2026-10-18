import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// waitFor / findBy give up after this long. The default of one second is too short when the machine is busy.
configure({ asyncUtilTimeout: 4000 })

afterEach(() => {
  cleanup()
  localStorage.clear()
})
