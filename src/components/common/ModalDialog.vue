<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import AppScrollbar from '@/components/layout/AppScrollbar.vue'
import { pushOverlay, popOverlay, isTopmost, hasOverlay } from '@/services/overlayStack'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  /**
   * Raises this dialog above another one. A dialog opened *from* a dialog — a
   * new tag coined while a photograph is being filed — has to sit over the one
   * that asked for it, and the two would otherwise be at the same height and
   * settle it by which happened to render last.
   */
  stacked: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const { t } = useI18n()

const panel = ref(null)
let lastFocused = null

/** This dialog's place in the shared overlay stack — see services/overlayStack. */
const token = Symbol('dialog')

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Keeps Tab cycling inside the dialog rather than wandering into the page. */
function trapFocus(event) {
  const focusable = panel.value?.querySelectorAll(FOCUSABLE)
  if (!focusable?.length) return

  const first = focusable[0]
  const last = focusable[focusable.length - 1]

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function onKeydown(event) {
  // Only the overlay on top answers the keyboard; anything underneath is
  // covered, and neither dismissing it nor cycling its fields is meant.
  if (!isTopmost(token)) return

  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  } else if (event.key === 'Tab') {
    trapFocus(event)
  }
}

/**
 * Close on a backdrop click only when the press both started and ended on the
 * backdrop. Selecting text inside the panel and releasing outside it must not
 * count as a click on the backdrop, or the dialog would vanish mid-selection.
 */
let pressedOnBackdrop = false

function onBackdropDown(event) {
  pressedOnBackdrop = event.target === event.currentTarget
}

function onBackdropUp(event) {
  if (pressedOnBackdrop && event.target === event.currentTarget) emit('close')
  pressedOnBackdrop = false
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      lastFocused = document.activeElement
      pushOverlay(token)
      document.addEventListener('keydown', onKeydown)
      document.body.style.overflow = 'hidden'
      await nextTick()
      // A dialog whose whole purpose is one field says so with `data-autofocus`
      // and gets the caret there; everything else starts at the top, which for
      // this panel is the close button.
      const first =
        panel.value?.querySelector('[data-autofocus]') ?? panel.value?.querySelector(FOCUSABLE)
      first?.focus()
    } else {
      popOverlay(token)
      document.removeEventListener('keydown', onKeydown)
      // Only the last one out gives the page its scrolling back: a dialog
      // closing over another one would otherwise unlock the page underneath
      // both of them.
      if (!hasOverlay()) document.body.style.overflow = ''
      lastFocused?.focus?.()
      lastFocused = null
    }
  },
)

onBeforeUnmount(() => {
  popOverlay(token)
  document.removeEventListener('keydown', onKeydown)
  if (!hasOverlay()) document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <!-- Keyframes rather than transitions, so the reduced-motion rules still
         leave Vue an `animationend` to wait for — see assets/main.css. -->
    <Transition name="modal">
      <div
        v-if="open"
        class="fixed inset-0 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
        :class="stacked ? 'z-[2200]' : 'z-[2000]'"
        @pointerdown="onBackdropDown"
        @pointerup="onBackdropUp"
      >
        <!--
          A frame around the scroller rather than one box doing both jobs. The
          overlay scrollbar has to be positioned against something that does not
          scroll, and the browser's own bar — the reason for drawing one at all —
          cuts a straight grey lane down a panel whose corners are rounded.
        -->
        <div class="modal-panel relative w-full sm:max-w-lg">
          <div
            ref="panel"
            class="no-scrollbar max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-paper-raised shadow-xl sm:rounded-xl"
            role="dialog"
            aria-modal="true"
            :aria-label="title"
          >
            <div
              class="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-edge bg-paper-raised px-5 py-3"
            >
              <h2 class="text-sm font-semibold text-ink">{{ title }}</h2>
              <button
                type="button"
                class="rounded p-1 text-ink-faint transition hover:text-ink"
                :aria-label="t('common.close')"
                @click="emit('close')"
              >
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  aria-hidden="true"
                >
                  <path d="m5 5 10 10M15 5 5 15" stroke-linecap="round" />
                </svg>
              </button>
            </div>

            <div class="px-5 py-4"><slot /></div>

            <div
              v-if="$slots.footer"
              class="sticky bottom-0 z-10 flex justify-end gap-2 border-t border-edge bg-paper-raised px-5 py-3"
            >
              <slot name="footer" />
            </div>
          </div>

          <AppScrollbar class="my-1.5 me-0.5" :target="panel" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
