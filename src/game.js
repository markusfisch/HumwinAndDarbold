'use strict'

const atlasSize = 1024,
	tileSize = 128,
	horizon = 100,
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
	cacheMat = new Float32Array(16)

let gl,
	atlasTexture,
	spriteModelBuffer,
	spriteUvBuffer,
	groundModelBuffer,
	groundUvBuffer,
	amountOfGroundVertices,
	vertexLoc,
	uvLoc,
	projMatLoc,
	modelViewMatLoc,
	screenWidth,
	screenHeight

function drawModel(n, modelMat) {
	gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, gl.FALSE, 0, n << 5)
	multiply(modelViewMat, viewMat, modelMat)
	gl.uniformMatrix4fv(modelViewMatLoc, gl.FALSE, modelViewMat)
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

function drawSprite(n, x, y, z) {
	spriteMat[12] = x
	spriteMat[13] = y
	spriteMat[14] = z
	drawModel(n, spriteMat)
}

function compareDist(a, b) {
	return b.dist - a.dist
}

const objects = [
	{sprite: 0, x: 0, y: 1, z: 0, update: function() {
		this.x = Math.sin(cameraRotation) * 3}},
	{sprite: 0, x: 4, y: 1, z: 4, update: function() {}},
	{sprite: 1, x: 3, y: 1, z: 3, update: function() {}}
]
let cameraRotation = 0,
	camX, camA,
	camY, camB,
	camZ, camC,
	camL
function run() {
	requestAnimationFrame(run)

	lookAt(0, 0, cameraRotation)
	cameraRotation += .01

	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

	gl.bindBuffer(gl.ARRAY_BUFFER, groundModelBuffer)
	gl.vertexAttribPointer(vertexLoc, 3, gl.FLOAT, gl.FALSE, 0, 0)
	gl.bindBuffer(gl.ARRAY_BUFFER, groundUvBuffer)
	gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, gl.FALSE, 0, 0)

	multiply(modelViewMat, viewMat, idMat)
	gl.uniformMatrix4fv(modelViewMatLoc, gl.FALSE, modelViewMat)
	gl.drawArrays(gl.TRIANGLES, 0, amountOfGroundVertices)

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
			d = (camA*dx + camB*dy + camC*dz) * camL,
			x = camA*d,
			y = camB*d,
			z = camC*d
		o.dist = x*x + y*y + z*z
	})
	objects.sort(compareDist).forEach(o => {
		drawSprite(o.sprite, o.x, o.y, o.z)
	})
}

function lookAt(x, z, a) {
	rotate(viewMat, idMat, a, 0, 1, 0)
	translate(viewMat, viewMat, x + camPos[0], camPos[1], z + camPos[2])
	rotate(viewMat, viewMat, -.9, 1, 0, 0)

	camA = viewMat[8]
	camB = viewMat[9]
	camC = viewMat[10]
	camL = 1 / (camA*camA + camB*camB + camC*camC)
	camX = viewMat[12]
	camY = viewMat[13]
	camZ = viewMat[14]

	translate(spriteMat, viewMat, 0, 0, 0)
	spriteMat[12] = spriteMat[13] = spriteMat[14] = 0

	invert(viewMat, viewMat)
}

function resize() {
	gl.canvas.width = screenWidth = gl.canvas.clientWidth
	gl.canvas.height = screenHeight = gl.canvas.clientHeight
	gl.viewport(0, 0, screenWidth, screenHeight)
	setPerspective(projMat, Math.PI * .125, screenWidth / screenHeight, .1,
		horizon)
	gl.uniformMatrix4fv(projMatLoc, gl.FALSE, projMat)
	//lookAt(0, 0, 0)
}

function compileShader(type, src) {
	const id = gl.createShader(type)
	gl.shaderSource(id, src)
	gl.compileShader(id)
	if (!gl.getShaderParameter(id, gl.COMPILE_STATUS)) {
		throw gl.getShaderInfoLog(id)
	}
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

function calcUvCoords() {
	const coords = [],
		f = 1 / atlasSize,
		n = .5 * f
	for (let y = 0; y < atlasSize; y += tileSize) {
		for (let x = 0; x < atlasSize; x += tileSize) {
			const l = x * f,
				t = y * f,
				r = l + tileSize * f,
				b = t + tileSize * f
			// A--C
			// | /|
			// |/ |
			// B--D
			coords.push(
				l + n, t + n,
				l + n, b - n,
				r - n, t + n,
				r - n, b - n,
			)
		}
	}
	return coords
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

	atlasTexture = createTexture(atlas)

	const spriteCoords = calcUvCoords(),
		groundVertices = createGroundModel()

	amountOfGroundVertices = groundVertices.length / 3
	groundModelBuffer = createBuffer(groundVertices)
	groundUvBuffer = createBuffer(
		createGroundUv(amountOfGroundVertices, spriteCoords))

	spriteModelBuffer = createBuffer([
		// A--C
		// | /|
		// |/ |
		// B--D
		-1, 1, 0,
		-1, -1, 0,
		1, 1, 0,
		1, -1, 0,
	])
	spriteUvBuffer = createBuffer(spriteCoords)

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

	run()
}

function svgToImg(svg, size) {
	const img = new Image()
	img.src = `data:image/svg+xml;base64,${btoa(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${svg}</svg>`)}`
	return img
}

function createAtlas() {
	const sprites = ['A', 'B', 'C', 'D'],
		canvas = document.createElement('canvas'),
		ctx = canvas.getContext('2d')
	canvas.width = canvas.height = atlasSize
	canvas.pending = sprites.length
	let x = 0, y = 0
	sprites.forEach(name => {
		const xx = x, yy = y
		svgToImg(document.getElementById(name).innerHTML,
				tileSize).onload = function() {
			ctx.drawImage(this, xx, yy)
			--canvas.pending
		}
		x += tileSize
		if (x >= atlasSize) {
			x = 0
			y += tileSize
		}
	})
	return canvas
}

function waitForAtlas(atlas) {
	if (atlas.pending > 0) {
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
