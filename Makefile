PATH := node_modules/.bin:$(PATH)
PATH := $(PATH):$(V23_ROOT)/third_party/cout/node/bin

.DEFAULT_GOAL := all

port ?= 1058

js_files := $(shell find src -name "*.js")
server_static := $(patsubst src/static/%,server-root/%,$(wildcard src/static/*))
tests := $(patsubst %.js,%,$(shell find test -name "*.js"))

out_dirs := ifc server-root node_modules

.DELETE_ON_ERROR:

.PHONY: all
all: static js
	@true

.PHONY: static
static: $(server_static)

.PHONY: js
js: server-root/bundle.js

ifc: src/ifc/*
	@VDLPATH=src vdl generate -lang=javascript -js-out-dir=. ifc

node_modules: package.json
	@npm prune
	@npm install
	@npm install $(V23_ROOT)/release/javascript/core/ #TODO: remove
	@touch node_modules # if npm does nothing, we don't want to keep trying

server-root:
	@mkdir server-root

server-root/bundle.js: ifc node_modules $(js_files) | server-root
	browserify --debug src/index.js 1> $@

$(server_static): server-root/%: src/static/% | server-root
	@cp $< $@
	@echo "Copying static file $<"

.PHONY: lint
lint: node_modules
	@jshint .

.PHONY: test
test: lint $(tests)

.PHONY: $(tests)
$(tests): test/%: test/%.js test/* mocks/* ifc node_modules $(js_files)
	@tape $<

.PHONY: start
start: all
	@static server-root -p $(port)

.PHONY: clean
clean:
	rm -rf $(out_dirs)
