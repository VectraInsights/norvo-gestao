import { test, expect } from '@playwright/test';

test.describe('Módulo Fiscal - Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Simular navegação para o dashboard primeiro
    await page.goto('http://localhost:8080/dashboard');
  });

  test('deve carregar a página de Notas de Saída', async ({ page }) => {
    await page.goto('http://localhost:8080/fiscal/emitidas');
    await expect(page.getByText('Notas de Saída')).toBeVisible();
    await expect(page.getByText('Gestão Fiscal')).toBeVisible();
  });

  test('deve carregar a página de Notas de Entrada', async ({ page }) => {
    await page.goto('http://localhost:8080/fiscal/recebidas');
    await expect(page.getByText('Notas de Entrada')).toBeVisible();
    await expect(page.getByText('Validar XML antes de importar')).toBeVisible();
  });

  test('deve carregar a página de Painel do Contador', async ({ page }) => {
    await page.goto('http://localhost:8080/fiscal/contador');
    await expect(page.getByText('Painel do Contador')).toBeVisible();
  });

  test('deve carregar a página de Configurações Fiscais', async ({ page }) => {
    await page.goto('http://localhost:8080/fiscal/configuracoes');
    await expect(page.getByText('Configurações Fiscais')).toBeVisible();
  });
});
