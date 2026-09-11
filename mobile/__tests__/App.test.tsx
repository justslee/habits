describe('Rituals', () => {
  it('basic sanity test', () => {
    expect(1 + 1).toBe(2);
  });

  it('app name is correct', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const appJson = require('../app.json');
    expect(appJson.expo.name).toBe('Rituals');
  });
});
