# Runbook: verificar cambios

## Verificación automática (siempre)

```
pnpm verify
```

Ejecuta, en este orden: `typecheck` (tipos), `lint` (Prettier y chequeo de arquitectura), `test` (Vitest) y los dos builds (`build` y `build:server`). Si cualquiera falla, el cambio no se commitea.

Estado de cada paso y qué comprueba realmente:

| Paso           | Qué comprueba                                   | Límite                                                                        |
| -------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `typecheck`    | Tipos de todo el proyecto.                      | No detecta fallos en tiempo de ejecución.                                     |
| `lint`         | Formato y reglas de dependencia entre features. | No hay ESLint: no comprueba estilo de código ni bugs.                         |
| `test`         | Vitest.                                         | Hoy no hay tests (`tests/` aplazado): pasa con cero tests y no verifica nada. |
| `build`        | Compila el cliente con Vite.                    | Detecta imports rotos, no comportamiento.                                     |
| `build:server` | Compila el servidor.                            | Igual que el anterior.                                                        |

## Verificación manual (cuando afecta a la interfaz o a la conexión)

1. `pnpm dev:server` y `pnpm dev:client`, o `pnpm build && pnpm start` para probar lo que se va a desplegar.
2. Probar con dos dispositivos o dos ventanas: crear sala, unirse, enviar un archivo y un texto, descargar.
3. Revisar la consola del navegador: no debe haber errores de CSP ni de imports.
4. Comprobar la vista a 360 px de ancho (DevTools, modo móvil).

Las pruebas con navegador headless o con capturas gastan muchos tokens: hacerlas solo cuando el usuario lo pida o en una pasada final.

## Antes del commit

- `tmp/` vacía o inexistente.
- Solo los archivos del cambio, añadidos por ruta (nunca `git add .`).
- Formato con `pnpm format` si `pnpm lint` falla por Prettier.
