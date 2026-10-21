/**
 * Altura útil de uma página dentro do `main` do app-shell.
 *
 * O `main` tem `overflow-auto` e o app-shell usa `min-h-screen` (não `h-screen`),
 * então quem rola é a janela. Para uma tela de LISTA travar a altura da página
 * (a lista cresce até o rodapé e rola só dentro dela), a página precisa ocupar
 * exatamente a altura disponível: viewport − header (h-16 = 64px) − o padding
 * vertical do `main` (py-6 / py-8 / py-10).
 */
export const ALTURA_PAGINA =
  "h-[calc(100dvh-112px)] min-h-[500px] flex flex-col sm:h-[calc(100dvh-128px)] lg:h-[calc(100dvh-144px)]";
