export type SqlToken = {
  type:
    'keyword' | 'function' | 'string' | 'number' | 'comment' | 'operator' | 'identifier' | 'space';
  text: string;
};

// SQL commands, clauses, EXPLAIN options and PostgreSQL types used by the corpus.
const keywords = new Set(
  `
  ALL ALTER ANALYZE AND ANY ARRAY AS ASC AT AUTHORIZATION BEGIN BETWEEN BIGINT
  BIGSERIAL BINARY BIT BOOLEAN BOTH BY CASCADE CASE CAST CHAR CHARACTER CHECK
  COLLATE COLUMN COMMIT CONCURRENTLY CONFLICT CONSTRAINT CREATE CROSS CURRENT
  CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP CURRENT_USER DATABASE DATE DECIMAL
  DEFAULT DEFERRABLE DELETE DESC DISTINCT DO DOUBLE DROP EACH ELSE END ENUM ESCAPE
  EXCEPT EXCLUDE EXCLUSIVE EXECUTE EXISTS EXPLAIN FALSE FETCH FILTER FIRST FLOAT
  FOR FOREIGN FREEZE FROM FULL FUNCTION GRANT GROUP HAVING IF ILIKE IN INCLUDE
  INDEX INHERITS INITIALLY INNER INSERT INT INTEGER INTERSECT INTERVAL INTO IS
  ISOLATION JOIN JSON JSONB KEY LAST LATERAL LEFT LEVEL LIKE LIMIT LOCAL LOCK
  MATERIALIZED MONEY NATURAL NOT NOTHING NOTIFY NULL NULLS NUMERIC OF OFFSET ON
  ONLY OPERATOR OR ORDER OUTER OVER OVERLAPS PARTITION PRECISION PRIMARY PRIVILEGES
  RANGE READ REAL RECURSIVE REFERENCES REINDEX RELEASE RENAME REPEATABLE REPLACE
  RESET RESTRICT RETURNING RETURNS REVOKE RIGHT ROLLBACK ROW ROWS SAVEPOINT SCHEMA
  SELECT SEQUENCE SERIAL SERIALIZABLE SESSION SET SHARE SHOW SMALLINT SMALLSERIAL
  SOME TABLE TABLES TABLESPACE TEMP TEMPORARY TEXT THEN TIME TIMESTAMP TO TRAILING
  TRANSACTION TRIGGER TRUE TRUNCATE TYPE UNBOUNDED UNION UNIQUE UNKNOWN UNLOGGED
  UPDATE USER USING UUID VACUUM VALUES VARCHAR VARYING VERBOSE VIEW WHEN WHERE
  WINDOW WITH WITHOUT WORK WRITE XML ZONE BUFFERS COSTS FORMAT SETTINGS SUMMARY
  TIMING WAL SERIALIZE MEMORY GENERIC_PLAN ADD ALWAYS GENERATED STORED POLICY
  PERMISSIVE RESTRICTIVE ENABLE SECURITY ROLE STATISTICS ORDINALITY PATH NESTED
  QUOTES OMIT KEEP OBJECT KEYS RECORD WRAPPER PASSING OPTION SCALAR ERROR
  PREPARE DEALLOCATE COPY START CONVERSION CLUSTER DISCARD REASSIGN ANALYSE
`
    .trim()
    .split(/\s+/),
);

export function tokenizeSql(source: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  const space = /\s+/y;
  const word = /[\p{L}_][\p{L}\p{N}_$]*/uy;
  const number = /(?:\$\d+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/y;
  const dollar = /\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/y;
  const operator = /[+*/<>=~!@#%^&|`?:;,().\[\]{}-]/y;
  let position = 0;
  function match(pattern: RegExp): string | undefined {
    pattern.lastIndex = position;
    return pattern.exec(source)?.[0];
  }
  function emit(type: SqlToken['type'], end: number) {
    tokens.push({ type, text: source.slice(position, end) });
    position = end;
  }
  while (position < source.length) {
    const whitespace = match(space);
    if (whitespace) {
      emit('space', position + whitespace.length);
    } else if (source.startsWith('--', position)) {
      const end = source.indexOf('\n', position + 2);
      emit('comment', end === -1 ? source.length : end);
    } else if (source.startsWith('/*', position)) {
      let end = position + 2;
      let depth = 1;
      while (end < source.length && depth > 0) {
        if (source.startsWith('/*', end)) {
          depth++;
          end += 2;
        } else if (source.startsWith('*/', end)) {
          depth--;
          end += 2;
        } else end++;
      }
      emit('comment', end);
    } else if (source[position] === "'" || source[position] === '"') {
      const quote = source[position];
      let end = position + 1;
      while (end < source.length) {
        if (source[end++] === quote) {
          if (source[end] === quote) end++;
          else break;
        }
      }
      emit(quote === "'" ? 'string' : 'identifier', end);
    } else {
      const delimiter = match(dollar);
      if (delimiter) {
        const end = source.indexOf(delimiter, position + delimiter.length);
        emit('string', end === -1 ? source.length : end + delimiter.length);
        continue;
      }
      const numeric = match(number);
      if (numeric) {
        emit('number', position + numeric.length);
        continue;
      }
      const identifier = match(word);
      if (identifier) {
        let next = position + identifier.length;
        while (next < source.length && /\s/.test(source[next] ?? '')) next++;
        emit(
          keywords.has(identifier.toUpperCase())
            ? 'keyword'
            : source[next] === '('
              ? 'function'
              : 'identifier',
          position + identifier.length,
        );
        continue;
      }
      // Consume punctuation singly so adjacent comment openers are never swallowed.
      const punctuation = match(operator);
      emit(punctuation ? 'operator' : 'identifier', position + 1);
    }
  }
  return tokens;
}
