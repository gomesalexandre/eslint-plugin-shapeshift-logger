/**
 * Finds the variable by a given name in a given scope and its upper scopes.
 * @param {eslint-scope.Scope} initScope A scope to start find.
 * @param {string} name A variable name to find.
 * @returns {eslint-scope.Variable|null} A found variable or `null`.
 */
const getVariableByName = (initScope, name) => {
  let scope = initScope;

  while (scope) {
    const variable = scope.set.get(name);

    if (variable) {
      return variable;
    }

    scope = scope.upper;
  }

  return null;
};

module.exports = { getVariableByName };
