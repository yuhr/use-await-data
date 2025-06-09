import type { Config } from "jest"
import { createDefaultEsmPreset } from "ts-jest"

const presetConfig = createDefaultEsmPreset({
  testEnvironment: "node",
})

export default {
  ...presetConfig,
} satisfies Config