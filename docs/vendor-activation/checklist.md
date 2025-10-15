# Checklist — Fornecedor (Termos)

- [ ] Exibir folha de Termos em tela cheia
- [ ] Habilitar "Aceitar" somente após leitura + checkbox
- [ ] Persistir aceite no `profiles`
- [ ] Redirecionar para o próximo passo do fluxo do fornecedor
- [ ] (opcional) botão "Salvar PDF" dos termos
- [ ] (opcional) métrica de aceite/visualização

## Saídas esperadas no PR
- Código isolado do slice (sem quebrar fluxo de Empresa)
- Feature flag ou detecção de `role = 'vendor'`
- Teste manual básico descrito no PR
