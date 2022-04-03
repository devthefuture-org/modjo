# modjo - rapid application development framework

## Getting started
```sh
yarn add @modjo/plugins/core
```

## Samples
are on TODO list...

## The Paradigm

### Full IoC
Dependency injection using composition root design pattern (avoiding prop drilling).

Context by async thread.
- using [nctx](https://github.com/devthejo/nctx) (node async_hooks)

### Highly scalable using CQRS
Best suitable for big projects with complexe architecture.

micro-services:
- [app](./micro-services/app/)
- [watcher](./micro-services/watcher/)
- [worker](./micro-services/worker/)

CQRS kesako ? un peu de lecture:
- [CQRS Wikipedia](https://en.wikipedia.org/wiki/Command%E2%80%93query_separation)
- [Pourquoi avoir choisi d'utiliser l'architecture CQRS](https://medium.com/tiller-systems/pourquoi-avoir-choisi-dutiliser-l-architecture-cqrs-e04c082f8b5f)


### Pure and performant native NodeJS
- no transpiller (no typescript/babel etc...)
- no bullshits
- [@vercel/ncc](https://github.com/vercel/ncc) compilable (faster bootup time and less I/O overhead)
