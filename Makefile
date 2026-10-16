UUID := clipboard-popup@imshaaz21.github.com
DEST := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: pack install uninstall nested pot test check smoke
NODE ?= node

test:
	$(NODE) --experimental-vm-modules tests/run.mjs
	gjs -m tests/storage.js

check: test
	glib-compile-schemas --strict --dry-run extension/schemas
	@for f in extension/*.js; do $(NODE) --input-type=module --check < "$$f" || exit; done

smoke:
	bash tests/shell-smoke.sh

pot:       ## regenerate po/clipboard-popup.pot from the sources
	mkdir -p po
	xgettext --from-code=UTF-8 --keyword=_ --output=po/clipboard-popup.pot extension/*.js
pack:      ## build dist/$(UUID).shell-extension.zip for extensions.gnome.org
	mkdir -p dist
	@if ls po/*.po >/dev/null 2>&1; then \
		for po in po/*.po; do \
			lang=$$(basename $$po .po); \
			mkdir -p extension/locale/$$lang/LC_MESSAGES; \
			msgfmt -o extension/locale/$$lang/LC_MESSAGES/clipboard-popup.mo $$po; \
		done; \
	fi
	gnome-extensions pack extension --extra-source=history.js --extra-source=storage.js --extra-source=capture.js --extra-source=actions.js --extra-source=menu.js --force --out-dir=dist

install: pack ## install the packed build for the current user
	gnome-extensions install --force dist/$(UUID).shell-extension.zip
	@echo "Log out/in (Wayland) or press Alt+F2, r (X11), then: gnome-extensions enable $(UUID)"

uninstall:
	gnome-extensions uninstall $(UUID)

SHELL_MAJOR := $(shell gnome-shell --version | grep -o '[0-9]*' | head -1)
SHELL_FLAGS ?= $(shell [ $(SHELL_MAJOR) -ge 49 ] && echo --devkit || echo --nested --wayland)
DEV := $(CURDIR)/dist/dev
nested:    ## try the repo code in a throw-away GNOME Shell
	rm -rf $(DEV)
	mkdir -p $(DEV)/gnome-shell/extensions/$(UUID)
	cp -r extension/. $(DEV)/gnome-shell/extensions/$(UUID)/
	glib-compile-schemas $(DEV)/gnome-shell/extensions/$(UUID)/schemas
	XDG_DATA_HOME=$(DEV) XDG_CONFIG_HOME=$(DEV)/config XDG_CACHE_HOME=$(DEV)/cache GSETTINGS_BACKEND=memory \
	GSETTINGS_SCHEMA_DIR=$(DEV)/gnome-shell/extensions/$(UUID)/schemas \
	dbus-run-session -- bash -c 'gnome-shell $(SHELL_FLAGS) & sleep 6; gnome-extensions enable $(UUID); wait'
