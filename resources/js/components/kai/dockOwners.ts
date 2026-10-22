import { ref } from 'vue';

/**
 * KAI flotantes que monta una página (p. ej. el laboratorio, con sus
 * propios ajustes). Mientras haya alguno, el de la intranet se aparta para
 * que nunca haya dos.
 */
export const pageDocks = ref(0);
