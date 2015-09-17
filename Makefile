PATH := node_modules/.bin:$(PATH)
PATH := $(JIRI_ROOT)/third_party/cout/node/bin:bin:$(PATH)

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

.PHONY: ifc
ifc: ifc/index.js

ifc/index.js: src/ifc/*
	@VDLPATH=src vdl generate -lang=javascript -js-out-dir=. ifc

node_modules: package.json
	@npm prune
	@npm install
	@ # TODO(rosswang): remove these two
	@npm install $(JIRI_ROOT)/release/javascript/core/
	@npm install $(JIRI_ROOT)/release/javascript/syncbase/
	@touch $@ # if npm does nothing, we don't want to keep trying

server-root:
	@mkdir server-root

server-root/bundle.js: ifc/index.js node_modules $(js_files) | server-root
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
$(tests): test/%: test/%.js test/* mocks/* ifc/index.js node_modules $(js_files)
	@tape $<

.PHONY: start
start: all
	@static server-root -p $(port)

bin/principal:
	jiri go build -a -o $@ v.io/x/ref/cmd/principal

bin/syncbased:
	jiri go build -a -o $@ v.io/x/ref/services/syncbase/syncbased

.PHONY: creds
creds: tmp/creds/$(creds)

tmp/creds/$(creds): bin/principal
	@principal seekblessings --v23.credentials $@

.PHONY: syncbase
syncbase: bin/syncbased creds
	@bash ./tools/start_services.sh

.PHONY: clean-all
clean-all: clean clean-tmp clean-bin

.PHONY: clean
clean:
	rm -rf $(out_dirs)

.PHONY: clean-tmp
clean-tmp:
	rm -rf tmp

.PHONY: clean-syncbase
clean-syncbase:
	rm -rf tmp/syncbase*

.PHONY: clean-creds
clean-creds:
	rm -rf tmp/creds

.PHONY: clean-bin
clean-bin:
	rm -rf bin
