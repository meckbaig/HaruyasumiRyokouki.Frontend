<script setup>
import { ref, watchEffect } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /**
   * The selection disagrees with itself. **Not a value** - the box holds
   * `modelValue` either way. See docs/features/media-editor.md.
   */
  mixed: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'change'])

const input = ref(null)

/*
  `indeterminate` is a property of the element and not an attribute, so it cannot
  be bound in the template at all - it has to be written onto the node whenever
  the answer changes.
*/
watchEffect(() => {
  if (input.value) input.value.indeterminate = props.mixed
})

function onChange(event) {
  emit('update:modelValue', event.target.checked)
  emit('change', event)
}
</script>

<template>
  <input
    ref="input"
    type="checkbox"
    class="rounded border-edge"
    :checked="modelValue"
    :disabled="disabled"
    @change="onChange"
  />
</template>
