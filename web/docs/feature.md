You know what? I have an idea that I think could become one of the standout features of this tool.

When users first launch the application, I want them to connect to a built-in demo database instead of requiring them to configure their own database immediately. This should allow them to explore every feature of the application without any setup or risk.

If users want to manage their own PostgreSQL database, they should simply update the connection URL (or connection settings) to point to their own server. Until they do that, the application should continue using our built-in demo database.

The demo database should behave like a complete playground:

- Every new user starts with the exact same dataset and schema.
- Users are free to do anything they want: create tables, modify schemas, insert data, update rows, delete records, drop tables, or even completely destroy the database.
- None of these changes should permanently affect the default playground.
- At any time, the user can click a **Reset Playground** button, and the database should instantly return to its original state, including the schema, tables, indexes, relationships, constraints, seed data, and every default row.
- The reset should make it feel like the user has received a brand-new database again.

To avoid confusion, whenever the application is connected to the built-in demo database, the UI should clearly display a **Playground** badge or banner indicating that the user is working with sample data rather than their own database.

My biggest concern is implementation complexity. Providing every user with what appears to be their own isolated playground that can be modified freely and instantly reset sounds technically challenging. However, if we can design this well, I believe it could become one of the most memorable and valuable features of the product because users can experience the full power of the tool before connecting their own database.

I'd like you to evaluate this idea from both a product and engineering perspective.

Specifically:

- Is this architecture practical and maintainable?
- What is the best technical approach to implement it?
- How would you isolate users so they cannot interfere with each other's playgrounds?
- What would be the fastest and most scalable reset mechanism?
- Would you recommend per-user databases, cloned templates, transaction snapshots, containers, schema cloning, or another approach?
- What are the trade-offs in terms of performance, storage, scalability, maintenance, and security?
- If you were designing this feature from scratch for a production-grade application, what architecture would you choose and why?

Please be critical as well. If there are weaknesses in this idea or a better alternative that would provide a similar user experience with less complexity, explain them and recommend the approach you would take.
