<script setup lang="ts">
const { t, locale, locales, setLocale } = useI18n()
const switchLocalePath = useSwitchLocalePath()
</script>

<template>
  <nav :aria-label="t('language.label')">
    <ul class="flex gap-1">
      <li
        v-for="option in locales"
        :key="option.code"
      >
        <!--
          A real link, so it can be opened in a new tab.
          A plain click goes through setLocale, which saves the choice before it navigates.
        -->
        <a
          :href="switchLocalePath(option.code)"
          :data-locale="option.code"
          :lang="option.language"
          :aria-current="option.code === locale ? 'true' : undefined"
          class="flex min-h-touch min-w-touch items-center justify-center rounded-md text-sm text-muted current:bg-accent current:font-strong current:text-on-accent"
          @click.exact.prevent="setLocale(option.code)"
        >
          {{ option.code.toUpperCase() }}<span class="sr-only"> – {{ option.name }}</span>
        </a>
      </li>
    </ul>
  </nav>
</template>
