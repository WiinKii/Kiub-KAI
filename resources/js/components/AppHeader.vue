<script lang="ts">
/**
 * Posición de la píldora activa compartida entre montajes. Inertia vuelve a
 * montar el layout en cada visita, así la píldora se desliza desde la sección
 * anterior en lugar de aparecer de golpe.
 */
const lastPill = { x: 0, w: 0, ready: false };
</script>

<script setup lang="ts">
import { Link, usePage } from '@inertiajs/vue3';
import {
    Bell,
    Calendar,
    ChevronDown,
    House,
    LayoutGrid,
    Menu,
    MessageSquare,
    Search,
    X,
} from '@lucide/vue';
import type { Component } from 'vue';
import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    watch,
} from 'vue';
import AppLogo from '@/components/AppLogo.vue';
import Breadcrumbs from '@/components/Breadcrumbs.vue';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import UserMenuContent from '@/components/UserMenuContent.vue';
import { useCurrentUrl } from '@/composables/useCurrentUrl';
import { getInitials } from '@/composables/useInitials';
import { arrivalPending, onNavbarReady } from '@/lib/kai/arrival';
import { dashboard } from '@/routes';
import type { BreadcrumbItem, NavItem } from '@/types';

type ModuleItem = NavItem & { description?: string };

type NavEntry = {
    key: string;
    title: string;
    icon: Component;
    href?: NavItem['href'];
    children?: ModuleItem[];
};

type Props = {
    breadcrumbs?: BreadcrumbItem[];
    /** Elementos del desplegable «Módulos». */
    modules?: ModuleItem[];
    /** Segunda línea de la tarjeta de usuario, p. ej. «Kaizen Holdings · IT Tecnología». */
    userSubtitle?: string;
    notificationCount?: number;
    /** Barras animadas junto al logo. */
    animatedMark?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    breadcrumbs: () => [],
    modules: () => [],
    userSubtitle: '',
    notificationCount: 0,
    animatedMark: true,
});

const emit = defineEmits<{
    search: [query: string];
    notifications: [];
}>();

const page = usePage();
const auth = computed(() => page.props.auth);
const { isCurrentUrl } = useCurrentUrl();

// Cambia estos href por tus rutas de Wayfinder cuando existan.
const navEntries = computed<NavEntry[]>(() => [
    { key: 'inicio', title: 'Inicio', icon: House, href: dashboard() },
    {
        key: 'modulos',
        title: 'Módulos',
        icon: LayoutGrid,
        children: props.modules,
    },
    {
        key: 'comunicaciones',
        title: 'Comunicaciones',
        icon: MessageSquare,
        href: '/comunicaciones',
    },
    {
        key: 'calendario',
        title: 'Calendario',
        icon: Calendar,
        href: '/calendario',
    },
]);

const activeKey = computed(() => {
    const match = navEntries.value.find((entry) =>
        entry.children
            ? entry.children.some((child) => isCurrentUrl(child.href))
            : entry.href !== undefined && isCurrentUrl(entry.href),
    );

    return match?.key ?? null;
});

// Al hacer clic la píldora se mueve de inmediato, sin esperar la respuesta.
const pendingKey = ref<string | null>(null);
const shownKey = computed(() => pendingKey.value ?? activeKey.value);

const modulesOpen = ref(false);
const userOpen = ref(false);
const sheetOpen = ref(false);
const mobileModulesOpen = ref(false);

const searchOpen = ref(false);
const searchTouched = ref(false);
const query = ref('');
const searchInput = ref<HTMLInputElement | null>(null);

const engaged = computed(
    () => searchOpen.value || userOpen.value || modulesOpen.value,
);

const userSubtitle = computed(
    () => props.userSubtitle || auth.value.user?.email || '',
);

const nameChars = computed(() =>
    Array.from(auth.value.user?.name ?? '').map((char) =>
        char === ' ' ? ' ' : char,
    ),
);

function onNavClick(event: MouseEvent, key: string) {
    if (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
    ) {
        return;
    }

    pendingKey.value = key;
    sheetOpen.value = false;
    modulesOpen.value = false;
}

/* ── Brillo del borde que sigue al cursor ───────────────────────────── */
const navEl = ref<HTMLElement | null>(null);
let moveFrame = 0;

function onPointerMove(event: PointerEvent) {
    const el = navEl.value;

    if (!el || moveFrame) {
        return;
    }

    const { clientX, clientY } = event;

    moveFrame = requestAnimationFrame(() => {
        moveFrame = 0;
        const rect = el.getBoundingClientRect();
        el.style.setProperty('--kn-mx', `${clientX - rect.left}px`);
        el.style.setProperty('--kn-my', `${clientY - rect.top}px`);
    });
}

/* ── Píldora de la sección activa ──────────────────────────────────── */
const groupEl = ref<HTMLElement | null>(null);
const pill = ref({
    x: lastPill.x,
    w: lastPill.w,
    ready: lastPill.ready,
    instant: !lastPill.ready,
});
let trackFrame = 0;
let resizeObserver: ResizeObserver | undefined;

function measurePill() {
    const group = groupEl.value;
    const key = shownKey.value;

    if (!group) {
        return;
    }

    const target = key
        ? group.querySelector<HTMLElement>(`[data-nav-key="${key}"]`)
        : null;

    if (!target || !target.offsetParent) {
        pill.value.ready = false;

        return;
    }

    let x = 0;
    let node: HTMLElement | null = target;

    while (node && node !== group) {
        x += node.offsetLeft;
        node = node.offsetParent as HTMLElement | null;
    }

    if (node !== group) {
        return;
    }

    const w = target.offsetWidth;

    pill.value.x = x;
    pill.value.w = w;
    pill.value.ready = true;
    Object.assign(lastPill, { x, w, ready: true });
}

// El punto activo anima su ancho, así que se mide durante la transición.
function trackPill(duration = 700) {
    cancelAnimationFrame(trackFrame);
    const end = performance.now() + duration;

    const step = () => {
        measurePill();

        if (performance.now() < end) {
            trackFrame = requestAnimationFrame(step);
        }
    };

    trackFrame = requestAnimationFrame(step);
}

watch(shownKey, () => nextTick(() => trackPill()));
watch(
    () => page.url,
    () => {
        pendingKey.value = null;
    },
);

/* ── Búsqueda que se transforma ────────────────────────────────────── */
let focusTimer: number | undefined;

function openSearch() {
    if (!searchOpen.value) {
        searchOpen.value = true;
        searchTouched.value = true;
        modulesOpen.value = false;
        userOpen.value = false;
    }

    window.clearTimeout(focusTimer);
    focusTimer = window.setTimeout(() => searchInput.value?.focus(), 160);
}

function closeSearch() {
    searchOpen.value = false;
    query.value = '';
    searchInput.value?.blur();
}

function submitSearch() {
    const value = query.value.trim();

    if (value) {
        emit('search', value);
    }
}

function onSearchBlur() {
    if (!query.value) {
        closeSearch();
    }
}

/* ── Llegada desde el inicio de sesión ─────────────────────────────── */
// Las gotas de KAI forman la cápsula sobre la página: la barra real espera
// oculta y aparece cuando la cápsula está completa; después, los controles.
const arriving = ref(arrivalPending());
const arrived = ref(false);
let offReady: (() => void) | undefined;
let arrivalTimer: number | undefined;

function revealBar() {
    offReady?.();
    window.clearTimeout(arrivalTimer);
    arriving.value = false;
    arrived.value = true;
    arrivalTimer = window.setTimeout(() => (arrived.value = false), 1600);
    nextTick(() => measurePill());
}

onMounted(() => {
    if (arriving.value) {
        offReady = onNavbarReady(revealBar);
        // Por si la llegada no termina (pestaña oculta, error): nunca sin barra.
        arrivalTimer = window.setTimeout(revealBar, 6000);
    }

    measurePill();
    requestAnimationFrame(() =>
        requestAnimationFrame(() => {
            pill.value.instant = false;
        }),
    );
    document.fonts?.ready.then(() => measurePill());

    if (groupEl.value && 'ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(() => measurePill());
        resizeObserver.observe(groupEl.value);
    }
});

onBeforeUnmount(() => {
    offReady?.();
    window.clearTimeout(arrivalTimer);
    cancelAnimationFrame(trackFrame);
    cancelAnimationFrame(moveFrame);
    window.clearTimeout(focusTimer);
    resizeObserver?.disconnect();
});
</script>

<template>
    <div
        class="kn-root"
        :class="{ 'is-arriving': arriving, 'is-arrived': arrived }"
    >
        <header class="kn-header">
            <div class="kn-shell">
                <nav
                    ref="navEl"
                    class="kn-bar"
                    :class="{
                        'is-engaged': engaged,
                        'is-searching': searchOpen,
                    }"
                    aria-label="Navegación principal"
                    @pointermove="onPointerMove"
                >
                    <span class="kn-sheen" aria-hidden="true" />
                    <span class="kn-spot" aria-hidden="true" />

                    <!-- Menú móvil -->
                    <Sheet v-model:open="sheetOpen">
                        <SheetTrigger as-child>
                            <button
                                type="button"
                                class="kn-icon kn-burger"
                                aria-label="Abrir menú"
                            >
                                <Menu class="kn-ic" aria-hidden="true" />
                            </button>
                        </SheetTrigger>
                        <SheetContent
                            side="left"
                            class="w-[300px] gap-0 border-white/80 bg-[#f1f4f8]/95 p-4 backdrop-blur-xl data-[state=open]:duration-500 data-[state=open]:ease-[cubic-bezier(.22,1,.36,1)] dark:border-white/10 dark:bg-[#0f1a22]/95"
                        >
                            <SheetTitle class="sr-only">
                                Menú de navegación
                            </SheetTitle>
                            <SheetHeader class="p-0 pb-5 text-left">
                                <Link
                                    :href="dashboard()"
                                    class="kn-logo"
                                    @click="onNavClick($event, 'inicio')"
                                >
                                    <span
                                        v-if="animatedMark"
                                        class="kn-mark"
                                        aria-hidden="true"
                                    >
                                        <i /><i /><i />
                                    </span>
                                    <span class="kn-word"><AppLogo /></span>
                                </Link>
                            </SheetHeader>

                            <div class="kn-sheet-body">
                                <nav
                                    class="kn-sheet-nav"
                                    aria-label="Secciones"
                                >
                                    <template
                                        v-for="entry in navEntries"
                                        :key="entry.key"
                                    >
                                        <template v-if="entry.children">
                                            <button
                                                type="button"
                                                class="kn-sheet-link"
                                                :class="{
                                                    'is-active':
                                                        shownKey === entry.key,
                                                }"
                                                :aria-expanded="
                                                    mobileModulesOpen
                                                        ? 'true'
                                                        : 'false'
                                                "
                                                @click="
                                                    mobileModulesOpen =
                                                        !mobileModulesOpen
                                                "
                                            >
                                                <component
                                                    :is="entry.icon"
                                                    class="kn-ic"
                                                    aria-hidden="true"
                                                />
                                                {{ entry.title }}
                                                <ChevronDown
                                                    class="kn-ic kn-chevron kn-push"
                                                    aria-hidden="true"
                                                />
                                            </button>
                                            <div
                                                class="kn-sub"
                                                :class="{
                                                    'is-open':
                                                        mobileModulesOpen,
                                                }"
                                            >
                                                <div class="kn-sub-inner">
                                                    <Link
                                                        v-for="item in entry.children"
                                                        :key="item.title"
                                                        :href="item.href"
                                                        class="kn-sub-link"
                                                        :tabindex="
                                                            mobileModulesOpen
                                                                ? 0
                                                                : -1
                                                        "
                                                        @click="
                                                            onNavClick(
                                                                $event,
                                                                entry.key,
                                                            )
                                                        "
                                                    >
                                                        {{ item.title }}
                                                    </Link>
                                                    <p
                                                        v-if="
                                                            !entry.children
                                                                .length
                                                        "
                                                        class="kn-empty"
                                                    >
                                                        Aún no hay módulos
                                                        configurados.
                                                    </p>
                                                </div>
                                            </div>
                                        </template>
                                        <Link
                                            v-else-if="entry.href"
                                            :href="entry.href"
                                            class="kn-sheet-link"
                                            :class="{
                                                'is-active':
                                                    shownKey === entry.key,
                                            }"
                                            :aria-current="
                                                activeKey === entry.key
                                                    ? 'page'
                                                    : undefined
                                            "
                                            @click="
                                                onNavClick($event, entry.key)
                                            "
                                        >
                                            <component
                                                :is="entry.icon"
                                                class="kn-ic"
                                                aria-hidden="true"
                                            />
                                            {{ entry.title }}
                                            <span
                                                class="kn-dot kn-push"
                                                aria-hidden="true"
                                            />
                                        </Link>
                                    </template>
                                </nav>

                                <div class="kn-sheet-user">
                                    <Avatar class="kn-avatar">
                                        <AvatarImage
                                            v-if="auth.user.avatar"
                                            :src="auth.user.avatar"
                                            :alt="auth.user.name"
                                        />
                                        <AvatarFallback
                                            class="kn-avatar-fallback"
                                        >
                                            {{ getInitials(auth.user?.name) }}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span class="kn-user-text">
                                        <span class="kn-user-name">
                                            {{ auth.user.name }}
                                        </span>
                                        <span
                                            v-if="userSubtitle"
                                            class="kn-user-sub"
                                        >
                                            {{ userSubtitle }}
                                        </span>
                                    </span>
                                </div>
                            </div>
                        </SheetContent>
                    </Sheet>

                    <Link
                        :href="dashboard()"
                        class="kn-logo kn-enter"
                        @click="onNavClick($event, 'inicio')"
                    >
                        <span
                            v-if="animatedMark"
                            class="kn-mark"
                            aria-hidden="true"
                        >
                            <i /><i /><i />
                        </span>
                        <span class="kn-word"><AppLogo /></span>
                    </Link>

                    <!-- Enlaces de escritorio -->
                    <div
                        ref="groupEl"
                        class="kn-links kn-enter"
                        :class="{ 'is-measured': pill.ready }"
                    >
                        <span
                            class="kn-pill"
                            :class="{ 'is-instant': pill.instant }"
                            :style="{
                                width: `${pill.w}px`,
                                transform: `translateX(${pill.x}px)`,
                            }"
                            aria-hidden="true"
                        />

                        <template v-for="entry in navEntries" :key="entry.key">
                            <DropdownMenu
                                v-if="entry.children"
                                v-model:open="modulesOpen"
                            >
                                <DropdownMenuTrigger as-child>
                                    <button
                                        type="button"
                                        class="kn-link"
                                        :class="{
                                            'is-active': shownKey === entry.key,
                                        }"
                                        :data-nav-key="entry.key"
                                    >
                                        <span
                                            class="kn-dot"
                                            aria-hidden="true"
                                        />
                                        <span class="kn-label">
                                            {{ entry.title }}
                                            <span
                                                class="kn-underline"
                                                aria-hidden="true"
                                            />
                                        </span>
                                        <ChevronDown
                                            class="kn-ic kn-chevron"
                                            aria-hidden="true"
                                        />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="start"
                                    :side-offset="16"
                                    class="min-w-[440px] rounded-[22px] border-white/90 bg-[#f6f8fb]/95 p-2.5 shadow-[0_2px_8px_rgba(5,25,36,0.06),0_28px_56px_-22px_rgba(5,25,36,0.38)] backdrop-blur-xl duration-300 dark:border-white/10 dark:bg-[#111d25]/95"
                                >
                                    <div class="kn-menu-body">
                                        <p class="kn-menu-title">
                                            {{ entry.title }}
                                        </p>
                                        <div
                                            v-if="entry.children.length"
                                            class="kn-menu-grid"
                                        >
                                            <DropdownMenuItem
                                                v-for="item in entry.children"
                                                :key="item.title"
                                                as-child
                                            >
                                                <Link
                                                    :href="item.href"
                                                    class="kn-menu-item"
                                                    @click="
                                                        onNavClick(
                                                            $event,
                                                            entry.key,
                                                        )
                                                    "
                                                >
                                                    <span class="kn-menu-icon">
                                                        <component
                                                            :is="
                                                                item.icon ??
                                                                LayoutGrid
                                                            "
                                                            class="kn-ic"
                                                            aria-hidden="true"
                                                        />
                                                    </span>
                                                    <span class="kn-menu-text">
                                                        <span
                                                            class="kn-menu-name"
                                                        >
                                                            {{ item.title }}
                                                        </span>
                                                        <span
                                                            v-if="
                                                                item.description
                                                            "
                                                            class="kn-menu-desc"
                                                        >
                                                            {{
                                                                item.description
                                                            }}
                                                        </span>
                                                    </span>
                                                </Link>
                                            </DropdownMenuItem>
                                        </div>
                                        <p v-else class="kn-empty">
                                            Aún no hay módulos configurados.
                                        </p>
                                    </div>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <Link
                                v-else-if="entry.href"
                                :href="entry.href"
                                class="kn-link"
                                :class="{ 'is-active': shownKey === entry.key }"
                                :data-nav-key="entry.key"
                                :aria-current="
                                    activeKey === entry.key ? 'page' : undefined
                                "
                                @click="onNavClick($event, entry.key)"
                            >
                                <span class="kn-dot" aria-hidden="true" />
                                <span class="kn-label">
                                    {{ entry.title }}
                                    <span
                                        class="kn-underline"
                                        aria-hidden="true"
                                    />
                                </span>
                            </Link>
                        </template>
                    </div>

                    <div class="kn-right kn-enter">
                        <!-- Búsqueda -->
                        <div
                            class="kn-search"
                            :class="{
                                'is-open': searchOpen,
                                'is-closed': searchTouched && !searchOpen,
                            }"
                            role="search"
                        >
                            <button
                                type="button"
                                class="kn-search-btn"
                                aria-label="Buscar"
                                :aria-expanded="searchOpen ? 'true' : 'false'"
                                @mousedown="
                                    searchOpen && $event.preventDefault()
                                "
                                @click="openSearch"
                            >
                                <Search class="kn-ic" aria-hidden="true" />
                            </button>
                            <input
                                ref="searchInput"
                                v-model="query"
                                type="text"
                                class="kn-search-input"
                                placeholder="Buscar en la intranet…"
                                aria-label="Buscar en la intranet"
                                autocomplete="off"
                                enterkeyhint="search"
                                :tabindex="searchOpen ? 0 : -1"
                                @keydown.enter.prevent="submitSearch"
                                @keydown.esc.prevent="closeSearch"
                                @blur="onSearchBlur"
                            />
                            <kbd class="kn-kbd" aria-hidden="true">ESC</kbd>
                            <button
                                type="button"
                                class="kn-search-close"
                                aria-label="Cerrar búsqueda"
                                :tabindex="searchOpen ? 0 : -1"
                                @click="closeSearch"
                            >
                                <X class="kn-ic" aria-hidden="true" />
                            </button>
                        </div>

                        <!-- Notificaciones -->
                        <button
                            type="button"
                            class="kn-icon kn-bell"
                            :aria-label="
                                notificationCount > 0
                                    ? `Notificaciones (${notificationCount} sin leer)`
                                    : 'Notificaciones'
                            "
                            @click="emit('notifications')"
                        >
                            <Bell class="kn-ic" aria-hidden="true" />
                            <span
                                v-if="notificationCount > 0"
                                class="kn-badge"
                                aria-hidden="true"
                            >
                                {{
                                    notificationCount > 9
                                        ? '9+'
                                        : notificationCount
                                }}
                            </span>
                        </button>

                        <!-- Usuario -->
                        <DropdownMenu v-model:open="userOpen">
                            <DropdownMenuTrigger as-child>
                                <button type="button" class="kn-user">
                                    <Avatar class="kn-avatar">
                                        <AvatarImage
                                            v-if="auth.user.avatar"
                                            :src="auth.user.avatar"
                                            :alt="auth.user.name"
                                        />
                                        <AvatarFallback
                                            class="kn-avatar-fallback"
                                        >
                                            {{ getInitials(auth.user?.name) }}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span class="kn-user-text">
                                        <span class="kn-user-name">
                                            <span class="sr-only">
                                                {{ auth.user.name }}
                                            </span>
                                            <span
                                                class="kn-wave"
                                                aria-hidden="true"
                                            >
                                                <span
                                                    v-for="(
                                                        char, index
                                                    ) in nameChars"
                                                    :key="index"
                                                    :style="{
                                                        animationDelay: `${index * 28}ms`,
                                                    }"
                                                    >{{ char }}</span
                                                >
                                            </span>
                                        </span>
                                        <span
                                            v-if="userSubtitle"
                                            class="kn-user-sub"
                                        >
                                            {{ userSubtitle }}
                                        </span>
                                    </span>
                                    <ChevronDown
                                        class="kn-ic kn-chevron"
                                        aria-hidden="true"
                                    />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                :side-offset="14"
                                class="w-64 rounded-[20px] border-white/90 bg-[#f6f8fb]/95 p-1.5 shadow-[0_2px_8px_rgba(5,25,36,0.06),0_28px_56px_-22px_rgba(5,25,36,0.38)] backdrop-blur-xl duration-300 dark:border-white/10 dark:bg-[#111d25]/95"
                            >
                                <UserMenuContent :user="auth.user" />
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </nav>
            </div>
        </header>

        <div v-if="props.breadcrumbs.length > 1" class="kn-crumbs">
            <Breadcrumbs :breadcrumbs="breadcrumbs" />
        </div>
    </div>
</template>

<style scoped>
.kn-root {
    --kn-ink: #051924;
    --kn-ink-2: #43535b;
    --kn-ink-3: #68747c;
    --kn-accent: #5d8093;
    --kn-avatar: #003144;
    --kn-chip: #e4eaf0;
    --kn-chip-hover: #edf1f5;
    --kn-group: rgba(221, 228, 234, 0.78);
    --kn-pill: #f3f4f8;
    --kn-pill-hover: #f8f9fb;
    --kn-active: #ffffff;
    --kn-field: #f8fafc;
    --kn-bar-top: rgba(241, 244, 248, 0.88);
    --kn-bar-bottom: rgba(222, 228, 237, 0.82);
    --kn-edge: rgba(255, 255, 255, 0.78);
    --kn-highlight: rgba(255, 255, 255, 0.95);
    --kn-shade: 5, 25, 36;

    --kn-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --kn-bounce: cubic-bezier(0.3, 1.35, 0.5, 1);
    --kn-soft: cubic-bezier(0.22, 1, 0.36, 1);
    --kn-swift: cubic-bezier(0.65, 0, 0.35, 1);
}

:root.dark .kn-root {
    --kn-ink: #e8eef2;
    --kn-ink-2: #a9b6bf;
    --kn-ink-3: #8b98a1;
    --kn-accent: #8fb0c2;
    --kn-avatar: #cfe2ec;
    --kn-chip: #1d2a33;
    --kn-chip-hover: #24333d;
    --kn-group: rgba(20, 32, 40, 0.7);
    --kn-pill: #1a2730;
    --kn-pill-hover: #20303a;
    --kn-active: #2a3a45;
    --kn-field: #15222b;
    --kn-bar-top: rgba(24, 36, 45, 0.86);
    --kn-bar-bottom: rgba(14, 24, 31, 0.82);
    --kn-edge: rgba(255, 255, 255, 0.08);
    --kn-highlight: rgba(255, 255, 255, 0.08);
    --kn-shade: 0, 0, 0;
}

.kn-ic {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    stroke-width: 1.9;
}

/* ── Barra ──────────────────────────────────────────────────────────── */
.kn-header {
    position: sticky;
    top: 0;
    z-index: 40;
    padding: 14px 10px 0;
}

.kn-shell {
    max-width: 1680px;
    margin: 0 auto;
}

.kn-bar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 22px;
    height: 62px;
    margin: 0 14px;
    padding: 0 7px 0 22px;
    border: 1px solid var(--kn-edge);
    border-radius: 22px;
    background: linear-gradient(
        180deg,
        var(--kn-bar-top) 0%,
        var(--kn-bar-bottom) 100%
    );
    box-shadow:
        inset 0 1px 0 var(--kn-highlight),
        inset 0 -1px 0 rgba(var(--kn-shade), 0.04),
        0 2px 6px -2px rgba(var(--kn-shade), 0.08),
        0 14px 34px -16px rgba(var(--kn-shade), 0.3);
    -webkit-backdrop-filter: blur(18px) saturate(1.35);
    backdrop-filter: blur(18px) saturate(1.35);
    transition:
        margin 0.75s var(--kn-spring),
        box-shadow 0.5s var(--kn-soft);
    animation: kn-in 0.9s var(--kn-soft) backwards;
}

/* La barra "respira": se expande al entrar el cursor y vuelve al salir. */
.kn-bar:hover,
.kn-bar.is-engaged {
    margin: 0;
    box-shadow:
        inset 0 1px 0 var(--kn-highlight),
        inset 0 -1px 0 rgba(var(--kn-shade), 0.04),
        0 3px 8px -3px rgba(var(--kn-shade), 0.1),
        0 22px 44px -18px rgba(var(--kn-shade), 0.38);
}

.kn-sheen,
.kn-spot {
    position: absolute;
    border-radius: inherit;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.5s var(--kn-soft);
}

.kn-sheen {
    inset: 0;
    background: radial-gradient(
        360px circle at var(--kn-mx, 50%) var(--kn-my, 0%),
        rgba(255, 255, 255, 0.62),
        rgba(255, 255, 255, 0) 62%
    );
}

.kn-spot {
    inset: -1px;
    padding: 1.5px;
    background: radial-gradient(
        240px circle at var(--kn-mx, 50%) var(--kn-my, 0%),
        #fff 0%,
        rgba(93, 128, 147, 0.6) 34%,
        rgba(93, 128, 147, 0) 72%
    );
    -webkit-mask:
        linear-gradient(#000 0 0) content-box,
        linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
}

:root.dark .kn-sheen {
    background: radial-gradient(
        360px circle at var(--kn-mx, 50%) var(--kn-my, 0%),
        rgba(255, 255, 255, 0.07),
        rgba(255, 255, 255, 0) 62%
    );
}

.kn-bar:hover .kn-sheen,
.kn-bar:hover .kn-spot {
    opacity: 1;
}

.kn-enter,
.kn-burger {
    position: relative;
    z-index: 1;
    animation: kn-item 0.8s var(--kn-soft) backwards;
}

.kn-logo.kn-enter {
    animation-delay: 0.08s;
}

.kn-links.kn-enter {
    animation-delay: 0.16s;
}

.kn-right.kn-enter {
    animation-delay: 0.24s;
}

/* ── Llegada: la barra espera a la cápsula de KAI ─────────────────────── */
.kn-root.is-arriving .kn-header,
.kn-root.is-arrived .kn-header {
    /* Sobre el telón de la llegada, bajo la capa de las gotas. */
    z-index: 70;
}

.kn-root.is-arriving .kn-bar {
    opacity: 0;
    animation: none;
}

.kn-root.is-arriving .kn-enter,
.kn-root.is-arriving .kn-burger {
    opacity: 0;
    animation: none;
}

.kn-root.is-arrived .kn-bar {
    animation: kn-arrive 0.32s ease-out backwards;
}

.kn-root.is-arrived .kn-enter,
.kn-root.is-arrived .kn-burger {
    animation-name: kn-item-arrive;
}

.kn-root.is-arrived .kn-logo.kn-enter {
    animation-delay: 0.12s;
}

.kn-root.is-arrived .kn-links.kn-enter {
    animation-delay: 0.2s;
}

.kn-root.is-arrived .kn-right.kn-enter {
    animation-delay: 0.28s;
}

/* ── Logo ───────────────────────────────────────────────────────────── */
.kn-logo {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 6px 2px;
    border-radius: 12px;
    color: var(--kn-ink);
}

.kn-word {
    display: inline-flex;
    align-items: center;
    transition: transform 0.55s var(--kn-spring);
}

.kn-logo:hover .kn-word {
    transform: scale(1.05);
}

.kn-mark {
    display: inline-flex;
    align-items: center;
    gap: 2.5px;
    height: 18px;
}

.kn-mark i {
    display: block;
    width: 3.5px;
    border-radius: 2px;
    background: var(--kn-ink);
    animation: kn-eq 1.9s ease-in-out infinite;
}

.kn-mark i:nth-child(1) {
    height: 10px;
    opacity: 0.35;
    animation-delay: -0.4s;
}

.kn-mark i:nth-child(2) {
    height: 18px;
    animation-delay: -1s;
}

.kn-mark i:nth-child(3) {
    height: 13px;
    opacity: 0.35;
    animation-delay: -1.4s;
}

.kn-logo:hover .kn-mark i {
    animation-duration: 0.75s;
}

/* ── Enlaces ────────────────────────────────────────────────────────── */
.kn-links {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 50px;
    padding: 4px;
    border: 1px solid rgba(255, 255, 255, 0.62);
    border-radius: 999px;
    background: var(--kn-group);
    box-shadow: inset 0 1px 2px rgba(var(--kn-shade), 0.05);
}

:root.dark .kn-links {
    border-color: rgba(255, 255, 255, 0.06);
}

.kn-pill {
    position: absolute;
    top: 4px;
    left: 0;
    height: 40px;
    border-radius: 999px;
    background: var(--kn-active);
    box-shadow:
        0 1px 2px rgba(var(--kn-shade), 0.08),
        0 6px 14px -6px rgba(var(--kn-shade), 0.22);
    opacity: 0;
    transition:
        transform 0.65s var(--kn-spring),
        width 0.65s var(--kn-spring),
        opacity 0.3s;
}

.kn-pill.is-instant {
    transition: none;
}

.kn-links.is-measured .kn-pill {
    opacity: 1;
}

.kn-link {
    position: relative;
    display: inline-flex;
    align-items: center;
    height: 40px;
    padding: 0 16px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    font: inherit;
    font-size: 15px;
    font-weight: 500;
    color: var(--kn-ink-2);
    cursor: pointer;
    transition: color 0.25s var(--kn-soft);
}

.kn-link:hover,
.kn-link.is-active {
    color: var(--kn-ink);
}

.kn-link:focus-visible {
    outline: 2px solid var(--kn-accent);
    outline-offset: 2px;
}

.kn-label {
    position: relative;
    display: inline-block;
    transform-origin: 50% 75%;
    transition: transform 0.5s var(--kn-spring);
}

.kn-link:hover .kn-label,
.kn-link:focus-visible .kn-label {
    transform: translateY(-1.5px) scale(1.07);
}

.kn-underline {
    position: absolute;
    right: 0;
    bottom: -4px;
    left: 0;
    height: 2px;
    border-radius: 2px;
    background: var(--kn-ink);
    box-shadow: 0 0 8px rgba(93, 128, 147, 0.55);
    transform: scaleX(0);
    transform-origin: left center;
    transition: transform 0.45s var(--kn-swift);
}

.kn-link:hover .kn-underline,
.kn-link:focus-visible .kn-underline {
    transform: scaleX(1);
}

.kn-dot {
    flex-shrink: 0;
    width: 0;
    height: 6px;
    margin-right: 0;
    border-radius: 50%;
    background: var(--kn-accent);
    opacity: 0;
    transform: scale(0);
    transition:
        width 0.35s var(--kn-soft),
        margin 0.35s var(--kn-soft),
        opacity 0.3s,
        transform 0.5s var(--kn-spring);
}

.is-active > .kn-dot {
    width: 6px;
    margin-right: 8px;
    opacity: 1;
    transform: scale(1);
    animation: kn-ping 2.6s var(--kn-soft) 1s infinite;
}

.kn-chevron {
    width: 16px;
    height: 16px;
    margin-left: 6px;
    color: var(--kn-ink-2);
    transition:
        transform 0.55s var(--kn-spring),
        color 0.25s;
}

.kn-link:hover .kn-chevron,
.kn-link[data-state='open'] .kn-chevron {
    color: var(--kn-ink);
    transform: rotate(-180deg);
}

/* ── Contenido de los desplegables (se renderiza en un portal) ─────── */
.kn-menu-title {
    margin: 4px 10px 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--kn-ink-3);
}

.kn-menu-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
}

.kn-menu-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    border-radius: 14px;
    color: var(--kn-ink);
    outline: none;
    animation: kn-drop 0.5s var(--kn-soft) backwards;
    transition:
        background 0.25s,
        transform 0.45s var(--kn-spring),
        box-shadow 0.3s;
}

.kn-menu-item:nth-child(2) {
    animation-delay: 0.04s;
}

.kn-menu-item:nth-child(3) {
    animation-delay: 0.08s;
}

.kn-menu-item:nth-child(n + 4) {
    animation-delay: 0.12s;
}

.kn-menu-item:hover,
.kn-menu-item[data-highlighted] {
    background: var(--kn-active);
    box-shadow: 0 6px 14px -10px rgba(var(--kn-shade), 0.35);
    transform: translateX(3px);
}

.kn-menu-icon {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 12px;
    background: var(--kn-chip);
    color: var(--kn-ink);
    transition:
        transform 0.5s var(--kn-spring),
        background 0.25s;
}

.kn-menu-item:hover .kn-menu-icon,
.kn-menu-item[data-highlighted] .kn-menu-icon {
    background: var(--kn-group);
    transform: rotate(-6deg) scale(1.06);
}

.kn-menu-text {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
}

.kn-menu-name {
    font-size: 14px;
    font-weight: 600;
}

.kn-menu-desc {
    font-size: 12px;
    color: var(--kn-ink-3);
}

.kn-empty {
    margin: 0;
    padding: 6px 10px 10px;
    font-size: 13px;
    color: var(--kn-ink-3);
}

/* ── Lado derecho ───────────────────────────────────────────────────── */
.kn-right {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
}

.kn-icon {
    position: relative;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.72);
    border-radius: 999px;
    background: var(--kn-chip);
    color: var(--kn-ink);
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(var(--kn-shade), 0.06);
    transition:
        transform 0.5s var(--kn-spring),
        background 0.25s,
        box-shadow 0.35s var(--kn-soft);
}

:root.dark .kn-icon,
:root.dark .kn-search,
:root.dark .kn-user {
    border-color: rgba(255, 255, 255, 0.08);
}

.kn-icon:hover {
    background: var(--kn-chip-hover);
    box-shadow: 0 10px 20px -12px rgba(var(--kn-shade), 0.4);
    transform: translateY(-1px);
}

.kn-icon:active {
    transform: scale(0.93);
}

.kn-icon:focus-visible,
.kn-user:focus-visible,
.kn-search-btn:focus-visible,
.kn-search-close:focus-visible {
    outline: 2px solid var(--kn-accent);
    outline-offset: 2px;
}

.kn-burger {
    display: none;
    width: 44px;
    height: 44px;
}

.kn-bell .kn-ic {
    transform-origin: 50% 12%;
}

.kn-bell:hover .kn-ic {
    animation: kn-ring 0.9s var(--kn-soft);
}

.kn-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    display: grid;
    place-items: center;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border: 2px solid var(--kn-chip);
    border-radius: 999px;
    background: var(--kn-accent);
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
    color: #fff;
    animation: kn-pop 0.6s var(--kn-spring);
}

/* Búsqueda: el botón circular se transforma en un campo. */
.kn-search {
    position: relative;
    width: 48px;
    height: 48px;
    flex-shrink: 0;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.72);
    border-radius: 999px;
    background: var(--kn-chip);
    box-shadow: 0 1px 2px rgba(var(--kn-shade), 0.06);
    transition:
        width 0.7s var(--kn-bounce),
        background 0.3s,
        border-color 0.3s,
        box-shadow 0.35s var(--kn-soft);
}

.kn-search:hover {
    background: var(--kn-chip-hover);
}

.kn-search.is-open {
    width: 300px;
    border-color: rgba(93, 128, 147, 0.55);
    background: var(--kn-field);
    box-shadow:
        0 0 0 4px rgba(93, 128, 147, 0.14),
        inset 0 1px 2px rgba(var(--kn-shade), 0.06);
    animation: kn-morph-in 0.6s var(--kn-soft);
}

.kn-search.is-closed {
    animation: kn-morph-out 0.6s var(--kn-soft);
}

.kn-search-btn {
    position: absolute;
    top: 0;
    left: 0;
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--kn-ink);
    cursor: pointer;
}

.kn-search-btn .kn-ic {
    transition: transform 0.5s var(--kn-spring);
}

.kn-search:not(.is-open) .kn-search-btn:hover .kn-ic {
    transform: scale(1.12) rotate(-10deg);
}

.kn-search-input {
    position: absolute;
    top: 0;
    right: 88px;
    left: 44px;
    height: 46px;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    color: var(--kn-ink);
    opacity: 0;
    visibility: hidden;
    filter: blur(4px);
    transform: translateX(-10px);
    transition:
        opacity 0.2s,
        transform 0.4s var(--kn-soft),
        filter 0.25s,
        visibility 0s linear 0.3s;
}

.kn-search-input::placeholder {
    font-weight: 400;
    color: var(--kn-ink-3);
}

.kn-search.is-open .kn-search-input {
    opacity: 1;
    visibility: visible;
    filter: none;
    transform: none;
    transition:
        opacity 0.3s 0.14s,
        transform 0.55s var(--kn-spring) 0.14s,
        filter 0.35s 0.14s,
        visibility 0s;
}

.kn-kbd {
    position: absolute;
    top: 50%;
    right: 44px;
    display: grid;
    place-items: center;
    height: 20px;
    margin-top: -10px;
    padding: 0 6px;
    border: 1px solid rgba(var(--kn-shade), 0.12);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.75);
    font:
        600 10px/1 ui-monospace,
        SFMono-Regular,
        Menlo,
        monospace;
    letter-spacing: 0.06em;
    color: var(--kn-ink-3);
    opacity: 0;
    transform: scale(0.8);
    transition:
        opacity 0.2s,
        transform 0.3s;
}

:root.dark .kn-kbd {
    border-color: rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
}

.kn-search.is-open .kn-kbd {
    opacity: 1;
    transform: none;
    transition:
        opacity 0.3s 0.22s,
        transform 0.5s var(--kn-spring) 0.22s;
}

.kn-search-close {
    position: absolute;
    top: 50%;
    right: 7px;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    margin-top: -16px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--kn-ink-2);
    cursor: pointer;
    opacity: 0;
    visibility: hidden;
    transform: scale(0.5) rotate(-90deg);
    transition:
        opacity 0.2s,
        transform 0.3s,
        background 0.2s,
        visibility 0s linear 0.3s;
}

.kn-search-close .kn-ic {
    width: 16px;
    height: 16px;
    transition: transform 0.45s var(--kn-spring);
}

.kn-search.is-open .kn-search-close {
    opacity: 1;
    visibility: visible;
    transform: none;
    transition:
        opacity 0.3s 0.26s,
        transform 0.6s var(--kn-spring) 0.26s,
        background 0.2s,
        visibility 0s;
}

.kn-search-close:hover {
    background: rgba(var(--kn-shade), 0.07);
    color: var(--kn-ink);
}

.kn-search-close:hover .kn-ic {
    transform: rotate(90deg);
}

/* Tarjeta de usuario */
.kn-user {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    height: 48px;
    padding: 0 14px 0 4px;
    border: 1px solid rgba(255, 255, 255, 0.88);
    border-radius: 999px;
    background: var(--kn-pill);
    font: inherit;
    color: var(--kn-ink);
    text-align: left;
    cursor: pointer;
    box-shadow:
        0 1px 2px rgba(var(--kn-shade), 0.06),
        0 4px 12px -8px rgba(var(--kn-shade), 0.2);
    transition:
        transform 0.5s var(--kn-spring),
        box-shadow 0.35s var(--kn-soft),
        background 0.25s;
}

.kn-user:hover,
.kn-user[data-state='open'] {
    background: var(--kn-pill-hover);
    box-shadow:
        0 0 0 1px rgba(93, 128, 147, 0.18),
        0 12px 26px -14px rgba(var(--kn-shade), 0.42);
    transform: translateY(-1px);
}

.kn-user:active {
    transform: scale(0.98);
}

.kn-avatar {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 50%;
    box-shadow:
        0 0 0 1px rgba(93, 128, 147, 0.25),
        inset 0 1px 0 #fff;
    transition:
        transform 0.55s var(--kn-spring),
        box-shadow 0.3s;
}

.kn-avatar-fallback {
    background: linear-gradient(180deg, #fff 0%, #eef2f6 100%);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--kn-avatar);
}

:root.dark .kn-avatar-fallback {
    background: linear-gradient(180deg, #24333d 0%, #1a2730 100%);
}

.kn-user:hover .kn-avatar {
    box-shadow:
        0 0 0 2px rgba(93, 128, 147, 0.38),
        inset 0 1px 0 #fff;
    transform: scale(1.06) rotate(-5deg);
}

.kn-user-text {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1px;
    line-height: 1.25;
}

.kn-user-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--kn-ink);
}

.kn-user-sub {
    font-size: 12px;
    white-space: nowrap;
    color: var(--kn-ink-3);
}

.kn-wave {
    display: inline-flex;
}

.kn-wave span {
    display: inline-block;
}

/* Ola de letras al pasar el cursor sobre la tarjeta. */
.kn-user:hover .kn-wave span {
    animation: kn-wave 0.6s var(--kn-soft) backwards;
}

.kn-user .kn-chevron {
    margin-left: 4px;
}

.kn-user:hover .kn-chevron {
    color: var(--kn-ink);
}

.kn-user[data-state='open'] .kn-chevron {
    transform: rotate(-180deg);
}

/* ── Menú lateral (móvil) ───────────────────────────────────────────── */
.kn-sheet-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 18px;
    min-height: 0;
}

.kn-sheet-nav {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.kn-sheet-nav > * {
    animation: kn-slide 0.6s var(--kn-soft) backwards;
}

.kn-sheet-nav > :nth-child(1) {
    animation-delay: 0.1s;
}

.kn-sheet-nav > :nth-child(2) {
    animation-delay: 0.15s;
}

.kn-sheet-nav > :nth-child(3) {
    animation-delay: 0.2s;
}

.kn-sheet-nav > :nth-child(4) {
    animation-delay: 0.25s;
}

.kn-sheet-nav > :nth-child(5) {
    animation-delay: 0.3s;
}

.kn-sheet-link {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    height: 48px;
    padding: 0 14px;
    border: 0;
    border-radius: 16px;
    background: transparent;
    font: inherit;
    font-size: 15px;
    font-weight: 500;
    color: var(--kn-ink-2);
    text-align: left;
    cursor: pointer;
    transition:
        background 0.25s,
        color 0.25s,
        transform 0.45s var(--kn-spring),
        box-shadow 0.3s;
}

.kn-sheet-link:hover {
    background: rgba(255, 255, 255, 0.65);
    color: var(--kn-ink);
    transform: translateX(3px);
}

:root.dark .kn-sheet-link:hover,
:root.dark .kn-sub-link:hover {
    background: rgba(255, 255, 255, 0.05);
}

.kn-sheet-link.is-active {
    background: var(--kn-active);
    color: var(--kn-ink);
    box-shadow:
        0 1px 2px rgba(var(--kn-shade), 0.08),
        0 6px 14px -8px rgba(var(--kn-shade), 0.22);
}

.kn-sheet-link.is-active > .kn-dot {
    margin-right: 0;
}

.kn-sheet-link[aria-expanded='true'] .kn-chevron {
    transform: rotate(-180deg);
}

.kn-push {
    margin-left: auto;
}

.kn-sub {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.5s var(--kn-soft);
}

.kn-sub.is-open {
    grid-template-rows: 1fr;
}

.kn-sub-inner {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
    padding-left: 22px;
}

.kn-sub-link {
    display: flex;
    align-items: center;
    height: 40px;
    padding: 0 14px;
    border-left: 1px solid rgba(var(--kn-shade), 0.1);
    border-radius: 0 12px 12px 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--kn-ink-2);
    transition:
        background 0.25s,
        color 0.25s,
        transform 0.45s var(--kn-spring);
}

.kn-sub-link:hover {
    background: rgba(255, 255, 255, 0.65);
    color: var(--kn-ink);
    transform: translateX(3px);
}

.kn-sheet-user {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: auto;
    padding: 10px;
    border: 1px solid rgba(255, 255, 255, 0.9);
    border-radius: 20px;
    background: var(--kn-pill);
}

:root.dark .kn-sheet-user {
    border-color: rgba(255, 255, 255, 0.08);
}

/* ── Migas de pan ───────────────────────────────────────────────────── */
.kn-crumbs {
    max-width: 1680px;
    margin: 0 auto;
    padding: 12px 38px 0;
    color: var(--kn-ink-3);
}

/* ── Responsivo ─────────────────────────────────────────────────────── */
@media (max-width: 1023.98px) {
    .kn-links {
        display: none;
    }

    .kn-burger {
        display: grid;
    }

    .kn-bar {
        gap: 12px;
        padding-left: 9px;
    }
}

@media (max-width: 640px) {
    .kn-header {
        padding: 10px 6px 0;
    }

    .kn-bar {
        gap: 8px;
        height: 58px;
        margin: 0 6px;
        padding: 0 6px;
        border-radius: 20px;
    }

    .kn-icon,
    .kn-search {
        width: 44px;
        height: 44px;
    }

    .kn-search-btn,
    .kn-search-input {
        height: 42px;
    }

    .kn-search-btn {
        width: 42px;
    }

    .kn-search-input {
        right: 44px;
    }

    .kn-kbd {
        display: none;
    }

    .kn-user {
        gap: 4px;
        height: 44px;
        padding: 0 10px 0 2px;
    }

    .kn-user .kn-user-text {
        display: none;
    }

    .kn-bar.is-searching .kn-logo,
    .kn-bar.is-searching .kn-burger,
    .kn-bar.is-searching .kn-bell {
        display: none;
    }

    .kn-search.is-open {
        width: calc(100vw - 128px);
    }

    .kn-crumbs {
        padding: 10px 22px 0;
    }
}

@media (prefers-reduced-motion: reduce) {
    .kn-root *,
    .kn-sheet-body *,
    .kn-menu-body * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        transition-delay: 0s !important;
    }
}

/* ── Animaciones ────────────────────────────────────────────────────── */
@keyframes kn-in {
    from {
        opacity: 0;
        transform: translateY(-16px);
    }
}

@keyframes kn-item {
    from {
        opacity: 0;
        transform: translateY(-6px);
    }
}

@keyframes kn-arrive {
    from {
        opacity: 0;
    }
}

@keyframes kn-item-arrive {
    from {
        opacity: 0;
        transform: translateY(4px) scale(0.96);
    }
}

@keyframes kn-eq {
    0%,
    100% {
        transform: scaleY(1);
    }

    50% {
        transform: scaleY(0.55);
    }
}

@keyframes kn-ping {
    0% {
        box-shadow: 0 0 0 0 rgba(93, 128, 147, 0.55);
    }

    70%,
    100% {
        box-shadow: 0 0 0 7px rgba(93, 128, 147, 0);
    }
}

@keyframes kn-ring {
    0% {
        rotate: 0deg;
    }

    15% {
        rotate: 14deg;
    }

    30% {
        rotate: -12deg;
    }

    45% {
        rotate: 8deg;
    }

    60% {
        rotate: -5deg;
    }

    75% {
        rotate: 2deg;
    }

    100% {
        rotate: 0deg;
    }
}

@keyframes kn-wave {
    0% {
        transform: translateY(0);
    }

    35% {
        transform: translateY(-3px);
    }

    70% {
        transform: translateY(1px);
    }

    100% {
        transform: translateY(0);
    }
}

@keyframes kn-morph-in {
    0% {
        filter: blur(0);
    }

    25% {
        filter: blur(3px);
    }

    100% {
        filter: blur(0);
    }
}

@keyframes kn-morph-out {
    0% {
        filter: blur(0);
        transform: scaleY(1);
    }

    30% {
        filter: blur(2.5px);
        transform: scaleY(0.84);
    }

    65% {
        transform: scaleY(1.05);
    }

    100% {
        filter: blur(0);
        transform: scaleY(1);
    }
}

@keyframes kn-drop {
    from {
        opacity: 0;
        transform: translateY(-6px);
    }
}

@keyframes kn-slide {
    from {
        opacity: 0;
        transform: translateX(-14px);
    }
}

@keyframes kn-pop {
    0% {
        transform: scale(0);
    }

    100% {
        transform: scale(1);
    }
}
</style>
