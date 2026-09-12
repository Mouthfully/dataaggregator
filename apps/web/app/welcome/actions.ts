"use server";

import { redirect } from "next/navigation";

import { supabaseServer } from "../_auth/server";
import { slugify } from "./slug";

/**
 * FIRST RUN: the organisation, its first owner and its first workspace, in one transaction.
 *
 * This was the missing link in the whole product. A person could sign in successfully and have
 * nowhere to connect anything, nothing to bill and nothing to read -- because `create_organisation`
 * has existed in the schema since the first migration and nothing ever called it.
 *
 * IT IS A DATABASE FUNCTION AND NOT THREE INSERTS FROM HERE, and `20260908000900_signup.sql` says
 * why: an INSERT into `organisations` has no existing row to test membership against, so there is
 * no policy that can safely allow it -- any authenticated user could otherwise create an
 * organisation naming anyone. The function is SECURITY DEFINER and makes the organisation and its
 * owner together, so the window where an organisation exists with no members never opens.
 */

export interface WelcomeState {
  readonly error?: string;
  readonly name?: string;
}

export async function createOrganisation(
  _previous: WelcomeState,
  formData: FormData,
): Promise<WelcomeState> {
  const name = String(formData.get("name") ?? "").trim();

  // The column's own bound, checked here so the refusal is a sentence rather than a constraint
  // violation the customer cannot read.
  if (name.length < 1 || name.length > 200) {
    return { error: "Enter a company name, up to 200 characters.", name };
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin?next=%2Fwelcome");

  const suffix = crypto.randomUUID().slice(0, 8);
  const { error } = await supabase.rpc("create_organisation", {
    p_name: name,
    p_slug: slugify(name, suffix),
    p_workspace_name: name,
  });

  if (error) {
    // The database's message names functions and constraints. A customer is not its reader.
    return { error: "That could not be created. Try again in a moment.", name };
  }

  redirect("/dashboard");
}
