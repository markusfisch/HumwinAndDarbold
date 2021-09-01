'use strict'

const horizon = 100,
	skyColor = [0, .9, .5, 1],
	camPos = [0, 16, 12],
	idMat = new Float32Array([
		1, 0, 0, 0,
		0, 1, 0, 0,
		0, 0, 1, 0,
		0, 0, 0, 1]),
	projMat = new Float32Array(16),
	viewMat = new Float32Array(16),
	modelViewMat = new Float32Array(16),
	spriteMat = new Float32Array(16),
	groundMat = new Float32Array(16),
	cacheMat = new Float32Array(16),
	spriteSizes = [],
	pointerSpot = [0, 0, 0],
	pointersX = [],
	pointersY = [],
	compareDist = (a, b) => b.dist - a.dist

let gl,
	spriteModelBuffer,
	spriteUvBuffer,
	groundModelBuffer,
	groundUvBuffer,
	groundLength,
	vertexLoc,
	uvLoc,
	projMatLoc,
	modelViewMatLoc,
	screenWidth,
	screenHeight,
	camX, camA,
	camY, camB,
	camZ, camC,
	lookX,
	lookZ,
	pointers,
	now

function drawSprite(n, x, y, z) {
	spriteMat[12] = x
	spriteMat[13] = y
	spriteMat[14] = z
	const size = spriteSizes[n]
	scale(cacheMat, spriteMat, size[0], size[1], 1)
	gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, gl.FALSE, 0, n << 5)
	multiply(modelViewMat, viewMat, cacheMat)
	gl.uniformMatrix4fv(modelViewMatLoc, gl.FALSE, modelViewMat)
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

function moveToTarget(e, tx, tz, step) {
	const dx = tx - e.x,
		dz = tz - e.z,
		d = dx*dx + dz*dz
	e.dx = dx
	e.dz = dz
	if (d == 0) return
	if (d < step * step) {
		e.x = tx
		e.z = tz
	} else {
		const f = step / Math.sqrt(d)
		e.x += dx * f
		e.z += dz * f
	}
}

const objects = [
	{sprite: 0, x: 0, y: 0, z: 0, tx: 0, tz: 0, c: {x: 0, z: 0},
	last: 0, frame: 0,
	update: function() {
		moveToTarget(this, this.tx, this.tz, .07)
		if (now - this.last > 200) {
			++this.frame
			this.last = now
		}
		if (this.dx > 0) {
			this.sprite = 7 + this.frame % 2
		} else if (this.dx < 0) {
			this.sprite = 5 + this.frame % 2
		} else {
			this.sprite = 0
		}
		if (pointers > 0) {
			moveToPointer()
		}
		// Make camera follow with a slight delay.
		const dx = lookX - this.x,
			dz = lookZ - this.z,
			d = dx*dx + dz*dz
		if (d > 0) {
			const dd = Math.sqrt(d) - 2
			moveToTarget(this.c, this.tx, this.tz, dd > .01 ? dd : .05)
			lookAt(this.c.x, this.c.z)
		}
	}},
	{sprite: 0, x: 0, y: 0, z: -2, t: 0, update: function() {
		this.t += .01
		this.x = Math.sin(this.t) * 3
	}},
	{sprite: 0, x: 4, y: 0, z: 4, update: function() {}},
	{sprite: 1, x: 3.5, y: 0, z: 3.5, update: function() {}},
	{sprite: 4, x: -2, y: 0, z: 2, update: function() {}},
	{sprite: 4, x: 4, y: 0, z: 3, update: function() {}},
],
	player = objects[0]
function run() {
	requestAnimationFrame(run)
	now = Date.now()

	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

	// Draw ground.
	gl.bindBuffer(gl.ARRAY_BUFFER, groundModelBuffer)
	gl.vertexAttribPointer(vertexLoc, 3, gl.FLOAT, gl.FALSE, 0, 0)
	gl.bindBuffer(gl.ARRAY_BUFFER, groundUvBuffer)
	gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, gl.FALSE, 0, 0)

	multiply(modelViewMat, viewMat, idMat)
	gl.uniformMatrix4fv(modelViewMatLoc, gl.FALSE, modelViewMat)
	gl.drawArrays(gl.TRIANGLES, 0, groundLength)

	// Draw sprites.
	gl.bindBuffer(gl.ARRAY_BUFFER, spriteModelBuffer)
	gl.vertexAttribPointer(vertexLoc, 3, gl.FLOAT, gl.FALSE, 0, 0)
	gl.bindBuffer(gl.ARRAY_BUFFER, spriteUvBuffer)

	objects.forEach(o => {
		o.update()
		// Less operations to calculate the distance from the view plane
		// than it is to multiply the matrices.
		// https://en.wikipedia.org/wiki/Distance_from_a_point_to_a_plane
		const dx = camX - o.x,
			dy = camY - o.y,
			dz = camZ - o.z,
			d = camA*dx + camB*dy + camC*dz,
			x = camA*d,
			y = camB*d,
			z = camC*d
		o.dist = x*x + y*y + z*z
	})
	objects.sort(compareDist).forEach(o => {
		drawSprite(o.sprite, o.x, o.y, o.z)
	})
}

function rayGround(out, lx, ly, lz, dx, dy, dz) {
	const denom = -1*dy
	if (denom > .0001) {
		const t = -1*-ly / denom
		out[0] = lx + dx*t
		out[1] = ly + dy*t
		out[2] = lz + dz*t
		return t >= 0
	}
	return false
}

function getGroundSpot(out, nx, ny) {
	invert(cacheMat, projMat)
	const cx = cacheMat[0]*nx + cacheMat[4]*ny + -cacheMat[8] + cacheMat[12],
		cy = cacheMat[1]*nx + cacheMat[5]*ny + -cacheMat[9] + cacheMat[13]
	invert(cacheMat, viewMat)
	let x = cacheMat[0]*cx + cacheMat[4]*cy + -cacheMat[8],
		y = cacheMat[1]*cx + cacheMat[5]*cy + -cacheMat[9],
		z = cacheMat[2]*cx + cacheMat[6]*cy + -cacheMat[10],
		len = x*x + y*y + z*z
	if (len > 0) {
		len = 1 / Math.sqrt(len)
	}
	x *= len
	y *= len
	z *= len
	return rayGround(out, cacheMat[12], cacheMat[13], cacheMat[14], x, y, z)
}

function moveToPointer() {
	if (getGroundSpot(pointerSpot, pointersX[0], pointersY[0])) {
		player.tx = pointerSpot[0]
		player.tz = pointerSpot[2]
	}
}

function setPointer(event, down) {
	const touches = event.touches
	if (touches) {
		pointers = touches.length
		for (let i = pointers; i--;) {
			const t = touches[i]
			pointersX[i] = t.pageX
			pointersY[i] = t.pageY
		}
	} else if (!down) {
		pointers = 0
	} else {
		pointers = 1
		pointersX[0] = event.pageX
		pointersY[0] = event.pageY
	}

	// Map to WebGL coordinates.
	for (let i = pointers; i--;) {
		pointersX[i] = (2 * pointersX[i]) / screenWidth - 1
		pointersY[i] = 1 - (2 * pointersY[i]) / screenHeight
	}

	event.stopPropagation()
}

function pointerCancel(event) {
	setPointer(event, false)
}

function pointerUp(event) {
	// Because onMouseUp() will still fire after onMouseOut().
	if (pointers < 1) {
		return
	}
	setPointer(event, false)
}

function pointerMove(event) {
	setPointer(event, pointers)
	if (pointers > 0) {
		moveToPointer()
	}
}

function pointerDown(event) {
	setPointer(event, true)
	moveToPointer()
}

function lookAt(x, z) {
	lookX = x
	lookZ = z

	translate(viewMat, idMat, x, 0, z)
	rotate(viewMat, viewMat, .2, 0, 1, 0)
	translate(viewMat, viewMat, camPos[0], camPos[1], camPos[2])
	rotate(viewMat, viewMat, -.9, 1, 0, 0)

	// Normalized vector of the view direction.
	camA = viewMat[8]
	camB = viewMat[9]
	camC = viewMat[10]
	// View origin.
	camX = viewMat[12]
	camY = viewMat[13]
	camZ = viewMat[14]

	spriteMat.set(viewMat)

	invert(viewMat, viewMat)
}

function resize() {
	gl.canvas.width = screenWidth = gl.canvas.clientWidth
	gl.canvas.height = screenHeight = gl.canvas.clientHeight
	gl.viewport(0, 0, screenWidth, screenHeight)
	setPerspective(projMat, Math.PI * .125, screenWidth / screenHeight, .1,
		horizon)
	gl.uniformMatrix4fv(projMatLoc, gl.FALSE, projMat)
}

function compileShader(type, src) {
	const id = gl.createShader(type)
	gl.shaderSource(id, src)
	gl.compileShader(id)
	return id
}

function createProgram(vs, fs) {
	const id = gl.createProgram()
	gl.attachShader(id, compileShader(gl.VERTEX_SHADER, vs))
	gl.attachShader(id, compileShader(gl.FRAGMENT_SHADER, fs))
	gl.linkProgram(id)
	if (!gl.getProgramParameter(id, gl.LINK_STATUS)) {
		throw gl.getProgramInfoLog(id)
	}
	return id
}

function createGroundModel() {
	const vertices = [],
		radius = 4
	for (let y = -radius; y <= radius; ++y) {
		for (let x = -radius; x <= radius; ++x) {
			const xx = x * 2, yy = y * 2
			vertices.push(
				// A--B
				// | /
				// |/
				// C
				xx - 1, 0, yy + 1,
				xx + 1, 0, yy + 1,
				xx - 1, 0, yy - 1,
				//    E
				//   /|
				//  / |
				// D--F
				xx - 1, 0, yy - 1,
				xx + 1, 0, yy + 1,
				xx + 1, 0, yy - 1,
			)
		}
	}
	return vertices
}

function createGroundUv(l, uvCoords) {
	const groundUvs = []
	for (let i = 0; i < l; i += 4) {
		const offset = (2 + ((i >> 2) % 2)) << 3,
			left = uvCoords[offset],
			top = uvCoords[offset + 1],
			right = uvCoords[offset + 6],
			bottom = uvCoords[offset + 7]
		groundUvs.push(
			// A--B
			// | /
			// |/
			// C
			left, top,
			right, top,
			left, bottom,
			//    E
			//   /|
			//  / |
			// D--F
			left, bottom,
			right, top,
			right, bottom,
		)
	}
	return groundUvs
}

function createBuffer(data) {
	const id = gl.createBuffer()
	gl.bindBuffer(gl.ARRAY_BUFFER, id)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW)
	return id
}

function createTexture(image) {
	const id = gl.createTexture()
	gl.bindTexture(gl.TEXTURE_2D, id)
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
	gl.generateMipmap(gl.TEXTURE_2D)
	return id
}

function init(atlas) {
	gl = document.getElementById('Canvas').getContext('webgl')
	gl.enable(gl.DEPTH_TEST)
	gl.enable(gl.CULL_FACE)
	gl.enable(gl.BLEND)
	gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
	gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
	gl.clearColor(skyColor[0], skyColor[1], skyColor[2], skyColor[3])

	const atlasTexture = createTexture(atlas.canvas),
		groundVertices = createGroundModel()
	groundLength = groundVertices.length / 3
	groundModelBuffer = createBuffer(groundVertices)
	groundUvBuffer = createBuffer(createGroundUv(groundLength, atlas.coords))

	spriteModelBuffer = createBuffer([
		// A--C
		// | /|
		// |/ |
		// B--D
		-.5, 1, 0,
		-.5, 0, 0,
		.5, 1, 0,
		.5, 0, 0,
	])
	spriteUvBuffer = createBuffer(atlas.coords)

	const program = createProgram(
			document.getElementById('VertexShader').textContent,
			document.getElementById('FragmentShader').textContent),
		atlasTextureLoc = gl.getUniformLocation(program, 'texture')
	gl.enableVertexAttribArray(
		vertexLoc = gl.getAttribLocation(program, "vertex"))
	gl.enableVertexAttribArray(
		uvLoc = gl.getAttribLocation(program, "uv"))
	projMatLoc = gl.getUniformLocation(program, 'projMat')
	modelViewMatLoc = gl.getUniformLocation(program, 'modelViewMat')

	gl.useProgram(program)

	gl.activeTexture(gl.TEXTURE0)
	gl.bindTexture(gl.TEXTURE_2D, atlasTexture)
	gl.uniform1i(atlasTextureLoc, 0)

	window.onresize = resize
	resize()
	lookAt(0, 0)

	document.onmousedown = pointerDown
	document.onmousemove = pointerMove
	document.onmouseup = pointerUp
	document.onmouseout = pointerCancel

	if ('ontouchstart' in document) {
		document.ontouchstart = pointerDown
		document.ontouchmove = pointerMove
		document.ontouchend = pointerUp
		document.ontouchleave = pointerCancel
		document.ontouchcancel = pointerCancel

		// Prevent pinch/zoom on iOS 11.
		document.addEventListener('gesturestart', function(event) {
			event.preventDefault()
		}, false)
		document.addEventListener('gesturechange', function(event) {
			event.preventDefault()
		}, false)
		document.addEventListener('gestureend', function(event) {
			event.preventDefault()
		}, false)
	}

	run()
}

function svgToImg(svg, sw, sh, dw, dh) {
	const img = new Image()
	img.src = `data:image/svg+xml;base64,${btoa(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${
		sw} ${sh}" width="${dw}" height="${dh}">${svg}</svg>`)}`
	return img
}

// Packing algorithm from:
// http://www.blackpawn.com/texts/lightmaps/default.html
function atlasInsert(node, w, h) {
	if (node.l) {
		return atlasInsert(node.l, w, h) || atlasInsert(node.r, w, h)
	}
	if (node.img) {
		return
	}
	const rc = node.rc,
		rw = rc.r - rc.l,
		rh = rc.b - rc.t
	if (rw < w || rh < h) {
		return
	}
	if (rw == w && rh == h) {
		return node
	}
	node.l = {}
	node.r = {}
	if (rw - w > rh - h) {
		node.l.rc = {
			l: rc.l,
			t: rc.t,
			r: rc.l + w - 1,
			b: rc.b,
		}
		node.r.rc = {
			l: rc.l + w,
			t: rc.t,
			r: rc.r,
			b: rc.b,
		}
	} else {
		node.l.rc = {
			l: rc.l,
			t: rc.t,
			r: rc.r,
			b: rc.t + h - 1,
		}
		node.r.rc = {
			l: rc.l,
			t: rc.t + h,
			r: rc.r,
			b: rc.b,
		}
	}
	return node.l
}

function createAtlas() {
	const atlasSize = 1024,
		svgSize = 100,
		tileSize = 128,
		scale = tileSize / svgSize,
		border = 1,
		normalizedAtlasSize = 1 / atlasSize,
		pad = (border + 2) * normalizedAtlasSize,
		nodes = {rc: {l: 0, t: 0, r: atlasSize, b: atlasSize}},
		coords = [],
		sprites = document.getElementsByTagName('g'),
		canvas = document.createElement('canvas'),
		ctx = canvas.getContext('2d')
	canvas.width = canvas.height = atlasSize
	canvas.pending = sprites.length
	for (let i = 0, l = canvas.pending; i < l; ++i) {
		const e = sprites[i],
			size = e.textContent.trim().split('x'),
			sw = size[0] || svgSize,
			sh = size[1] || svgSize,
			dw = sw * scale | 0,
			dh = sh * scale | 0,
			node = atlasInsert(nodes, dw + border * 2, dh + border * 2)
		if (!node) {
			return
		}
		const rc = node.rc,
			l = rc.l * normalizedAtlasSize,
			t = rc.t * normalizedAtlasSize,
			r = l + dw * normalizedAtlasSize,
			b = t + dh * normalizedAtlasSize
		// A--C
		// | /|
		// |/ |
		// B--D
		coords.push(
			l + pad, t + pad,
			l + pad, b - pad,
			r - pad, t + pad,
			r - pad, b - pad,
		)
		spriteSizes.push([dw / tileSize, dh / tileSize])
		node.img = svgToImg(e.innerHTML, sw, sh, dw, dh).onload = function() {
			ctx.drawImage(this, node.rc.l + border, node.rc.t + border)
			--canvas.pending
		}
	}
	return {
		canvas: canvas,
		coords: coords
	}
}

function waitForAtlas(atlas) {
	if (atlas.canvas.pending > 0) {
		setTimeout(function() {
			waitForAtlas(atlas)
		}, 100)
	} else {
		init(atlas)
	}
}

window.onload = function() {
	waitForAtlas(createAtlas())
}

// Matrix functions below from: https://github.com/toji/gl-matrix

function invert(out, a) {
	const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
		a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
		a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
		a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15],
		b00 = a00 * a11 - a01 * a10,
		b01 = a00 * a12 - a02 * a10,
		b02 = a00 * a13 - a03 * a10,
		b03 = a01 * a12 - a02 * a11,
		b04 = a01 * a13 - a03 * a11,
		b05 = a02 * a13 - a03 * a12,
		b06 = a20 * a31 - a21 * a30,
		b07 = a20 * a32 - a22 * a30,
		b08 = a20 * a33 - a23 * a30,
		b09 = a21 * a32 - a22 * a31,
		b10 = a21 * a33 - a23 * a31,
		b11 = a22 * a33 - a23 * a32

	// Calculate the determinant.
	let d = b00 * b11 -
		b01 * b10 +
		b02 * b09 +
		b03 * b08 -
		b04 * b07 +
		b05 * b06

	if (!d) {
		return
	}

	d = 1 / d

	out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d
	out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d
	out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d
	out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d
	out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d
	out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d
	out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d
	out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d
	out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d
	out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d
	out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d
	out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d
	out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d
	out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d
	out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d
	out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d
}

function multiply(out, a, b) {
	let a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
		a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
		a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
		a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15]

	// Cache only the current line of the second matrix.
	let b0  = b[0], b1 = b[1], b2 = b[2], b3 = b[3]
	out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30
	out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31
	out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32
	out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33

	b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7]
	out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30
	out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31
	out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32
	out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33

	b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11]
	out[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30
	out[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31
	out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32
	out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33

	b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15]
	out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30
	out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31
	out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32
	out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33
}

function rotate(out, a, rad, x, y, z) {
	let len = Math.sqrt(x * x + y * y + z * z),
		s, c, t,
		a00, a01, a02, a03,
		a10, a11, a12, a13,
		a20, a21, a22, a23,
		b00, b01, b02,
		b10, b11, b12,
		b20, b21, b22

	if (len < .000001) {
		return
	}

	len = 1 / len
	x *= len
	y *= len
	z *= len

	s = Math.sin(rad)
	c = Math.cos(rad)
	t = 1 - c

	a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3]
	a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7]
	a20 = a[8]; a21 = a[9]; a22 = a[10]; a23 = a[11]

	// Construct the elements of the rotation matrix.
	b00 = x * x * t + c; b01 = y * x * t + z * s; b02 = z * x * t - y * s
	b10 = x * y * t - z * s; b11 = y * y * t + c; b12 = z * y * t + x * s
	b20 = x * z * t + y * s; b21 = y * z * t - x * s; b22 = z * z * t + c

	// Perform rotation-specific matrix multiplication.
	out[0] = a00 * b00 + a10 * b01 + a20 * b02
	out[1] = a01 * b00 + a11 * b01 + a21 * b02
	out[2] = a02 * b00 + a12 * b01 + a22 * b02
	out[3] = a03 * b00 + a13 * b01 + a23 * b02
	out[4] = a00 * b10 + a10 * b11 + a20 * b12
	out[5] = a01 * b10 + a11 * b11 + a21 * b12
	out[6] = a02 * b10 + a12 * b11 + a22 * b12
	out[7] = a03 * b10 + a13 * b11 + a23 * b12
	out[8] = a00 * b20 + a10 * b21 + a20 * b22
	out[9] = a01 * b20 + a11 * b21 + a21 * b22
	out[10] = a02 * b20 + a12 * b21 + a22 * b22
	out[11] = a03 * b20 + a13 * b21 + a23 * b22

	if (a !== out) {
		// If the source and destination differ, copy the unchanged last row.
		out[12] = a[12]
		out[13] = a[13]
		out[14] = a[14]
		out[15] = a[15]
	}
}

function scale(out, a, x, y, z) {
	out[0] = a[0] * x
	out[1] = a[1] * x
	out[2] = a[2] * x
	out[3] = a[3] * x
	out[4] = a[4] * y
	out[5] = a[5] * y
	out[6] = a[6] * y
	out[7] = a[7] * y
	out[8] = a[8] * z
	out[9] = a[9] * z
	out[10] = a[10] * z
	out[11] = a[11] * z
	out[12] = a[12]
	out[13] = a[13]
	out[14] = a[14]
	out[15] = a[15]
}

function translate(out, a, x, y, z) {
	if (a === out) {
		out[12] = a[0] * x + a[4] * y + a[8] * z + a[12]
		out[13] = a[1] * x + a[5] * y + a[9] * z + a[13]
		out[14] = a[2] * x + a[6] * y + a[10] * z + a[14]
		out[15] = a[3] * x + a[7] * y + a[11] * z + a[15]
	} else {
		let a00, a01, a02, a03,
			a10, a11, a12, a13,
			a20, a21, a22, a23

		a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3]
		a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7]
		a20 = a[8]; a21 = a[9]; a22 = a[10]; a23 = a[11]

		out[0] = a00; out[1] = a01; out[2] = a02; out[3] = a03
		out[4] = a10; out[5] = a11; out[6] = a12; out[7] = a13
		out[8] = a20; out[9] = a21; out[10] = a22; out[11] = a23

		out[12] = a00 * x + a10 * y + a20 * z + a[12]
		out[13] = a01 * x + a11 * y + a21 * z + a[13]
		out[14] = a02 * x + a12 * y + a22 * z + a[14]
		out[15] = a03 * x + a13 * y + a23 * z + a[15]
	}
}

function setPerspective(out, fov, aspect, near, far) {
	const f = 1 / Math.tan(fov), d = near - far
	out[0] = f / aspect
	out[1] = 0
	out[2] = 0
	out[3] = 0
	out[4] = 0
	out[5] = f
	out[6] = 0
	out[7] = 0
	out[8] = 0
	out[9] = 0
	out[10] = (far + near) / d
	out[11] = -1
	out[12] = 0
	out[13] = 0
	out[14] = (2 * far * near) / d
	out[15] = 0
}
