# Fluxo de ativação — Fornecedor (slice: Termos)
Este documento acompanha a implementação do passo "Termos" no fluxo de ativação do Fornecedor.

## Objetivo
- Reutilizar os termos da plataforma (mesma versão dos demais perfis).
- Gate de aceite + leitura (scroll-to-end + checkbox).
- Persistir: `profiles.terms_accepted`, `terms_version`, `terms_accepted_at`.
- Após aceitar, avançar para "Perfil do fornecedor".

## Telemetria mínima (depois):
- `terms_viewed`, `terms_accepted` (eventos de UI)

## Notas
- O HTML dos termos é servido em `/legal/terms/pt-BR/<VERSAO>/terms.html`
- A versão será mantida em constante única (ex.: `TERMS_VER = 1`)
