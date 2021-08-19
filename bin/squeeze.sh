#!/usr/bin/env bash
while read -r
do
	# collect referenced scripts
	[[ $REPLY == *\<script\ src=* ]] && {
		SRC=${REPLY#*src=\"}
		SRC=${SRC%%\"*}
		[ -r "$SRC" ] && {
			SCRIPTS=$SCRIPTS${SCRIPTS:+ }$SRC
			continue
		}
	}
	# embed scripts
	[ "$SCRIPTS" ] && {
		echo -n '<script>'
		cat <<EOF | esbuild --minify
'use strict'
$(cat $SCRIPTS | sed "s/['\"]use strict['\"]//")
EOF
		echo -n '</script>'
		SCRIPTS=
		continue
	}
	# remove indent
	REPLY=${REPLY##*$'\t'}
	# remove empty lines
	[ "$REPLY" ] || continue
	# keep preprocessor statements on a line
	[[ $REPLY == \#* ]] && {
		echo
		echo "$REPLY"
		continue
	}
	# remove optional blanks
	echo -n "$REPLY" | sed '
s/\([ML]\) /\1/g;
s/ {/{/g;
s/, /,/g;
s/: /:/g;
s/; /;/g;
s/;"/"/g;'
done | sed '
s/><\/circle>/\/>/g;
s/><\/ellipse>/\/>/g;
s/><\/line>/\/>/g;
s/><\/path>/\/>/g;
s/><\/polygon>/\/>/g;
s/><\/polyline>/\/>/g;
s/><\/rect>/\/>/g'
