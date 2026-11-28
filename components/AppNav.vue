<script setup lang="ts">
// One element for both layouts: fixed at the bottom on phones, a top row from "md" up.
const { t } = useI18n()

// The main pages. To plug in a new one, add its file in pages/ and one entry here.
const items = [
  { to: '/dashboard', label: 'nav.dashboard' },
  { to: '/dates', label: 'nav.dates' },
  { to: '/map', label: 'nav.map' },
  { to: '/photos', label: 'nav.photos' },
  { to: '/space', label: 'nav.space' },
]
</script>

<template>
  <nav
    :aria-label="t('nav.label')"
    class="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface pb-safe md:static md:border-t-0 md:border-b md:pb-0"
  >
    <ul class="mx-auto flex max-w-content md:gap-2 md:px-4">
      <li
        v-for="item in items"
        :key="item.to"
        class="flex-1 md:flex-none"
      >
        <!--
          NuxtLinkLocale adds the language prefix and sets aria-current on the active page.
          The active page differs by weight and a bar, not by colour alone.
        -->
        <NuxtLinkLocale
          :to="item.to"
          class="focus-inset flex min-h-nav items-center justify-center border-t-4 border-transparent px-3 text-sm text-muted current:border-accent current:font-strong current:text-accent md:border-t-0 md:border-b-4"
        >
          {{ t(item.label) }}
        </NuxtLinkLocale>
      </li>
    </ul>
  </nav>
</template>
