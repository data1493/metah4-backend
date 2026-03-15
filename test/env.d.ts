declare module 'cloudflare:test' {
	// ProvidedEnv is an intentional type-augmentation extension point for cloudflare:test
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface ProvidedEnv extends Env {}
}
