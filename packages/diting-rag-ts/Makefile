.PHONY: install build clean pack publish dev start test lint typecheck

PKG_DIR := $(shell pwd)
DIST_DIR := $(PKG_DIR)/dist

install:
	pnpm install

build: install
	pnpm run build

clean:
	rm -rf $(DIST_DIR)

rebuild: clean build

pack: build
	pnpm pack --pack-destination ..

publish: build
	pnpm publish --no-git-checks

dev:
	pnpm run dev

start: build
	pnpm run start

test:
	pnpm run test

test-watch:
	pnpm run test:watch

lint:
	pnpm run lint

typecheck:
	pnpm run typecheck
